import { injectable, singleton } from 'tsyringe';
import { Listener } from 'eventemitter2';
import { Manager } from '../control/manager';
import { EventBus } from '../control/event-bus';
import { PlayerNameFilterRule } from '../config/config';
import { InternalEventTypes } from '../types/events';
import { RconPlayer, RconPlayerConnected } from '../types/rcon';
import { IStatefulService } from '../types/service';
import { LogLevel } from '../util/logger';
import { RCON } from './rcon';
import { LoggerFactory } from './loggerfactory';

@singleton()
@injectable()
export class PlayerNameFilter extends IStatefulService {

    /**
     * Battleye reports a connecting player more than once and the sweep looks
     * at the same player list the connect events came from, so the same player
     * would be kicked repeatedly while the server is still processing the first
     * kick. Slots are remembered for a while to keep that to one kick.
     */
    private kickedSlots = new Map<string, number>();
    private kickedSlotRetention: number = 60000;

    private connectListener?: Listener;

    public constructor(
        loggerFactory: LoggerFactory,
        private manager: Manager,
        private eventBus: EventBus,
        private rcon: RCON,
    ) {
        super(loggerFactory.createLogger('PlayerNameFilter'));
    }

    public async start(): Promise<void> {
        await this.stop();

        if (!this.manager.config?.playerNameFilterEnabled) {
            this.log.log(LogLevel.DEBUG, 'Player name filter is disabled');
            return;
        }

        this.connectListener = this.eventBus.on(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            async (player) => this.checkConnectedPlayer(player),
        );

        const interval = this.manager.config?.playerNameFilterPollIntervall;
        if (interval && interval > 0) {
            this.timers.addInterval(
                'sweep',
                () => {
                    void this.sweep();
                },
                interval,
            );
        }

        this.log.log(
            LogLevel.INFO,
            `Player name filter started with ${this.manager.config?.playerNameFilter?.length ?? 0} rule(s)`,
        );
    }

    public async stop(): Promise<void> {
        this.timers.removeAllTimers();
        this.connectListener?.off();
        this.connectListener = undefined;
        this.kickedSlots.clear();
    }

    /**
     * Matches a name against a single rule.
     * Invalid regex patterns never match, they are a config error.
     */
    public matchesRule(name: string, rule: PlayerNameFilterRule): boolean {

        if (!name || !rule?.pattern) {
            return false;
        }

        const normalizedName = name.trim().toLowerCase();
        const pattern = rule.pattern.trim();

        switch (rule.matchType) {
            case 'exact': {
                return normalizedName === pattern.toLowerCase();
            }
            case 'regex': {
                try {
                    return new RegExp(pattern, 'i').test(name.trim());
                } catch (e) {
                    this.log.log(
                        LogLevel.WARN,
                        `Ignoring player name filter rule with invalid regex: ${pattern}`,
                        e,
                    );
                    return false;
                }
            }
            case 'contains':
            default: {
                return normalizedName.includes(pattern.toLowerCase());
            }
        }
    }

    public findMatchingRule(name: string): PlayerNameFilterRule | undefined {
        return (this.manager.config?.playerNameFilter ?? [])
            .find((rule) => this.matchesRule(name, rule));
    }

    private async checkConnectedPlayer(player: RconPlayerConnected | RconPlayer): Promise<void> {

        if (!this.manager.config?.playerNameFilterEnabled || !player?.id) {
            return;
        }

        const rule = this.findMatchingRule(player.name);
        if (!rule) {
            return;
        }

        if (this.wasKickedRecently(player.id)) {
            this.log.log(LogLevel.DEBUG, `Already kicked player #${player.id} (${player.name})`);
            return;
        }
        this.kickedSlots.set(player.id, new Date().valueOf());

        const reason = rule.reason
            || this.manager.config?.playerNameFilterReason
            || 'Please change your player name';

        this.log.log(
            LogLevel.IMPORTANT,
            `Kicking player #${player.id} (${player.name}) because their name matches '${rule.pattern}'`,
        );

        try {
            await this.rcon.kick(player.id, reason);
        } catch (e) {
            this.kickedSlots.delete(player.id);
            this.log.log(LogLevel.ERROR, `Failed to kick player #${player.id} (${player.name})`, e);
            return;
        }

        this.eventBus.emit(
            InternalEventTypes.DISCORD_MESSAGE,
            {
                type: 'admin',
                message: `Kicked ${player.name} (blacklisted name): ${reason}`,
            },
        );
    }

    private async sweep(): Promise<void> {

        if (!this.manager.config?.playerNameFilterEnabled) {
            return;
        }

        this.forgetStaleSlots();

        try {
            const players = await this.rcon.getPlayers();
            for (const player of players) {
                await this.checkConnectedPlayer(player);
            }
        } catch (e) {
            this.log.log(LogLevel.WARN, 'Failed to sweep player list for blacklisted names', e);
        }
    }

    private wasKickedRecently(slot: string): boolean {
        const kickedAt = this.kickedSlots.get(slot);
        return !!kickedAt && (new Date().valueOf() - kickedAt) < this.kickedSlotRetention;
    }

    private forgetStaleSlots(): void {
        const now = new Date().valueOf();
        for (const [slot, kickedAt] of [...this.kickedSlots.entries()]) {
            if ((now - kickedAt) >= this.kickedSlotRetention) {
                this.kickedSlots.delete(slot);
            }
        }
    }

}

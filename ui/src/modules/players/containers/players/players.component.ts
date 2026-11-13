import { Component, OnInit } from '@angular/core';
import { MergedPlayer, PlayersService } from '../../services/players.service';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
    standalone: false,
    selector: 'sb-players',
    templateUrl: './players.component.html',
    styleUrls: ['players.component.scss'],
})
export class PlayersComponent implements OnInit {

    public activeTab = 1;

    public kickReason: string = '';

    public selected?: MergedPlayer;

    private _steam64Input: string = '';
    public set steam64Input(id: string) {
        this._steam64Input = id;
        if (id?.length === 17) {
            this._dayzId = this.playerService.steam64ToDayZID(id);
            this._beGuid = this.playerService.steam64ToBEGUID(id);
        } else {
            this._dayzId = '';
            this._beGuid = '';
        }
    }
    public get steam64Input(): string {
        return this._steam64Input;
    }
    private _dayzId: string = '';
    public get dayzId(): string {
        return this._dayzId;
    }
    public set dayzId(value: string) {
        this._dayzId = value;
        this._steam64Input = '';
        this._beGuid = '';
    }
    private _beGuid: string = '';
    public get beGuid(): string {
        return this._beGuid;
    }
    public set beGuid(value: string) {
        this._beGuid = value;
        this._dayzId = '';
        this._steam64Input = '';
    }

    private sub?: Subscription;

    public constructor(
        public playerService: PlayersService,
    ) {}

    public ngOnInit(): void {
        this.sub = this.playerService.selected$.subscribe((x) => {
            this.selected = x;
            this.steam64Input = x?.steamid || '';
        });
    }

    public ngOnDestroy(): void {
        if (this.sub && !this.sub?.closed) {
            this.sub.unsubscribe();
            this.sub = undefined;
        }
    }

    /**
     * Battleye addresses players by their slot, so only a player that is
     * connected right now can be kicked. The slot is looked up again on every
     * call rather than taken from the selection: slots are reused, and acting
     * on a remembered one could hit whoever took it over.
     */
    public get kickableSlot(): string | undefined {
        return this.playerService.getOnlineSlot(this.selected?.beguid);
    }

    public async kick(): Promise<void> {
        const slot = this.kickableSlot;
        if (!slot) return;

        const name = this.selected?.name || this.selected?.ingamename || `player #${slot}`;
        const reason = this.kickReason?.trim();
        if (typeof window !== 'undefined' && !window.confirm(
            reason ? `Kick ${name}? Reason: ${reason}` : `Kick ${name}?`,
        )) return;

        await firstValueFrom(this.playerService.kick(slot, reason || undefined));
        this.kickReason = '';
    }

    public async ban(): Promise<void> {
        if (this.steam64Input?.length !== 17 && this.dayzId?.length !== 44) return;
        if (typeof window !== 'undefined' && !window.confirm(`Ban player ${this.steam64Input || this.dayzId}?`)) return;
        await firstValueFrom(this.playerService.ban(this.steam64Input || this.dayzId));
        await this.playerService.loadLists();
    }
    public async unban(): Promise<void> {
        if (this.steam64Input?.length !== 17 && this.dayzId?.length !== 44) return;
        if (typeof window !== 'undefined' && !window.confirm(`Unban player ${this.steam64Input || this.dayzId}?`)) return;
        await firstValueFrom(this.playerService.unban(this.steam64Input || this.dayzId));
        await this.playerService.loadLists();
    }
    public async whitelist(): Promise<void> {
        if (this.steam64Input?.length !== 17 && this.dayzId?.length !== 44) return;
        await firstValueFrom(this.playerService.whitelist(this.steam64Input || this.dayzId));
        await this.playerService.loadLists();
    }
    public async unwhitelist(): Promise<void> {
        if (this.steam64Input?.length !== 17 && this.dayzId?.length !== 44) return;
        await firstValueFrom(this.playerService.unwhitelist(this.steam64Input || this.dayzId));
        await this.playerService.loadLists();
    }
    public async prio(): Promise<void> {
        if (this.steam64Input?.length !== 17 && this.dayzId?.length !== 44) return;
        await firstValueFrom(this.playerService.prio(this.steam64Input || this.dayzId));
        await this.playerService.loadLists();
    }
    public async unprio(): Promise<void> {
        if (this.steam64Input?.length !== 17 && this.dayzId?.length !== 44) return;
        await firstValueFrom(this.playerService.unprio(this.steam64Input || this.dayzId));
        await this.playerService.loadLists();
    }

    public async reloadRconBans(): Promise<void> {
        await firstValueFrom(this.playerService.reloadRconBans());
        await this.playerService.loadLists();
    }

}

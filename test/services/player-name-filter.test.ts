import 'reflect-metadata';

import { expect } from '../expect';
import { StubInstance, disableConsole, enableConsole, sleep, stubClass } from '../util';
import { DependencyContainer, Lifecycle, container } from 'tsyringe';
import { Manager } from '../../src/control/manager';
import { EventBus } from '../../src/control/event-bus';
import { InternalEventTypes } from '../../src/types/events';
import { PlayerNameFilter } from '../../src/services/player-name-filter';
import { RCON } from '../../src/services/rcon';
import { Config, PlayerNameFilterRule } from '../../src/config/config';

describe('Test class PlayerNameFilter', () => {

    let injector: DependencyContainer;

    let manager: StubInstance<Manager>;
    let eventBus: EventBus;
    let rcon: StubInstance<RCON>;

    const configWith = (filter: PlayerNameFilterRule[], overrides?: Partial<Config>): Config => {
        return {
            ...new Config(),
            playerNameFilterEnabled: true,
            playerNameFilter: filter,
            playerNameFilterPollIntervall: 0,
            ...overrides,
        } as Config;
    };

    before(() => {
        disableConsole();
    });

    after(() => {
        enableConsole();
    });

    beforeEach(() => {
        container.reset();
        injector = container.createChildContainer();
        injector.register(Manager, stubClass(Manager), { lifecycle: Lifecycle.Singleton });
        injector.register(EventBus, EventBus, { lifecycle: Lifecycle.Singleton });
        injector.register(RCON, stubClass(RCON), { lifecycle: Lifecycle.Singleton });

        manager = injector.resolve(Manager) as any;
        eventBus = injector.resolve(EventBus);
        rcon = injector.resolve(RCON) as any;
    });

    it('PlayerNameFilter-matchesRule', () => {

        manager.config = configWith([]);
        const filter = injector.resolve(PlayerNameFilter);

        // contains is the default and is case insensitive
        expect(filter.matchesRule('xXAdminXx', { pattern: 'admin' })).to.be.true;
        expect(filter.matchesRule('xXAdminXx', { pattern: 'admin', matchType: 'contains' })).to.be.true;
        expect(filter.matchesRule('Survivor', { pattern: 'admin', matchType: 'contains' })).to.be.false;

        expect(filter.matchesRule('Admin', { pattern: 'admin', matchType: 'exact' })).to.be.true;
        expect(filter.matchesRule('xXAdminXx', { pattern: 'admin', matchType: 'exact' })).to.be.false;

        expect(filter.matchesRule('Server Owner', { pattern: '^server\\s', matchType: 'regex' })).to.be.true;
        expect(filter.matchesRule('The Server', { pattern: '^server\\s', matchType: 'regex' })).to.be.false;

        // names are trimmed before matching
        expect(filter.matchesRule('  admin  ', { pattern: 'admin', matchType: 'exact' })).to.be.true;

        // an invalid regex is a config error and must not match anything
        expect(filter.matchesRule('anything', { pattern: '([', matchType: 'regex' })).to.be.false;

        // incomplete input never matches
        expect(filter.matchesRule('', { pattern: 'admin' })).to.be.false;
        expect(filter.matchesRule('admin', { pattern: '' } as PlayerNameFilterRule)).to.be.false;
    });

    it('PlayerNameFilter-kicks matching player', async () => {

        manager.config = configWith(
            [{ pattern: 'admin' }],
            { playerNameFilterReason: 'change your name' },
        );

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'xXAdminXx' },
        );
        await sleep(10);

        expect(rcon.kick.callCount).to.equal(1);
        expect(rcon.kick.firstCall.args).to.deep.equal(['12', 'change your name']);

        await filter.stop();
    });

    it('PlayerNameFilter-prefers the rule reason', async () => {

        manager.config = configWith(
            [{ pattern: 'admin', reason: 'impersonating staff' }],
            { playerNameFilterReason: 'change your name' },
        );

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin' },
        );
        await sleep(10);

        expect(rcon.kick.firstCall.args[1]).to.equal('impersonating staff');

        await filter.stop();
    });

    it('PlayerNameFilter-ignores non matching player', async () => {

        manager.config = configWith([{ pattern: 'admin' }]);

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'Survivor' },
        );
        await sleep(10);

        expect(rcon.kick.callCount).to.equal(0);

        await filter.stop();
    });

    it('PlayerNameFilter-kicks a slot only once', async () => {

        manager.config = configWith([{ pattern: 'admin' }]);

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        // battleye reports the same player on connect and on guid verification
        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin', ip: '127.0.0.1', port: '2304' },
        );
        await sleep(10);
        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin', beguid: 'abc' },
        );
        await sleep(10);

        expect(rcon.kick.callCount).to.equal(1);

        await filter.stop();
    });

    it('PlayerNameFilter-retries after a failed kick', async () => {

        manager.config = configWith([{ pattern: 'admin' }]);
        rcon.kick.onFirstCall().rejects(new Error('not connected'));

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin' },
        );
        await sleep(10);
        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin' },
        );
        await sleep(10);

        expect(rcon.kick.callCount).to.equal(2);

        await filter.stop();
    });

    it('PlayerNameFilter-does nothing while disabled', async () => {

        manager.config = configWith([{ pattern: 'admin' }], { playerNameFilterEnabled: false });

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin' },
        );
        await sleep(10);

        expect(rcon.kick.callCount).to.equal(0);

        await filter.stop();
    });

    it('PlayerNameFilter-sweeps the player list', async () => {

        manager.config = configWith(
            [{ pattern: 'admin' }],
            { playerNameFilterPollIntervall: 10 },
        );
        rcon.getPlayers.resolves([
            { id: '1', name: 'Survivor', beguid: 'a', ip: '127.0.0.1', port: '2304', ping: '10', lobby: false },
            { id: '2', name: 'xXAdminXx', beguid: 'b', ip: '127.0.0.1', port: '2305', ping: '10', lobby: false },
        ]);

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        await sleep(50);

        expect(rcon.kick.callCount).to.equal(1);
        expect(rcon.kick.firstCall.args[0]).to.equal('2');

        await filter.stop();
    });

    it('PlayerNameFilter-survives a failing sweep', async () => {

        manager.config = configWith(
            [{ pattern: 'admin' }],
            { playerNameFilterPollIntervall: 10 },
        );
        rcon.getPlayers.rejects(new Error('not connected'));

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();

        await sleep(50);

        expect(rcon.kick.callCount).to.equal(0);

        await filter.stop();
    });

    it('PlayerNameFilter-stops listening', async () => {

        manager.config = configWith([{ pattern: 'admin' }]);

        const filter = injector.resolve(PlayerNameFilter);
        await filter.start();
        await filter.stop();

        eventBus.emit(
            InternalEventTypes.RCON_PLAYER_CONNECTED,
            { id: '12', name: 'admin' },
        );
        await sleep(10);

        expect(rcon.kick.callCount).to.equal(0);

        await filter.stop();
    });

});

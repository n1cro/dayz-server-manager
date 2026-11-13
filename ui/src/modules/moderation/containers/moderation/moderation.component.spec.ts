import { of, throwError } from 'rxjs';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import { ModerationComponent } from './moderation.component';

describe('ModerationComponent', () => {
    let component: ModerationComponent;
    let appCommon: jasmine.SpyObj<AppCommonService>;

    const config = (filter: any[]) => JSON.stringify({
        playerNameFilterEnabled: true,
        playerNameFilterReason: 'change your name',
        playerNameFilter: filter,
    });

    beforeEach(() => {
        appCommon = jasmine.createSpyObj<AppCommonService>('AppCommonService', [
            'fetchManagerConfig',
            'updateManagerConfig',
        ]);
        appCommon.fetchManagerConfig.and.returnValue(of(config([])));
        appCommon.updateManagerConfig.and.returnValue(of({}));
        component = new ModerationComponent(appCommon);
    });

    it('loads the rules from the manager config', async () => {
        appCommon.fetchManagerConfig.and.returnValue(of(config([{ pattern: 'admin' }])));

        component.ngOnInit();
        await Promise.resolve();

        expect(component.rules.length).toBe(1);
        expect(component.rules[0].pattern).toBe('admin');
        expect(component.loading).toBeFalse();
    });

    it('defaults a missing filter to an empty list', async () => {
        appCommon.fetchManagerConfig.and.returnValue(of(JSON.stringify({})));

        component.ngOnInit();
        await Promise.resolve();

        expect(component.rules).toEqual([]);
    });

    it('reports an empty pattern and an invalid regex', async () => {
        component.ngOnInit();
        await Promise.resolve();

        expect(component.ruleError({ pattern: '  ' })).toBeDefined();
        expect(component.ruleError({ pattern: '([', matchType: 'regex' })).toBeDefined();
        expect(component.ruleError({ pattern: '([', matchType: 'contains' })).toBeUndefined();
        expect(component.ruleError({ pattern: '^admin', matchType: 'regex' })).toBeUndefined();
    });

    it('refuses to save while a rule is invalid', async () => {
        component.ngOnInit();
        await Promise.resolve();
        component.addRule();

        component.onSubmit();

        expect(appCommon.updateManagerConfig).not.toHaveBeenCalled();
        expect(component.outcomeBadge?.success).toBeFalse();
    });

    it('saves the whole config once the rules are valid', async () => {
        component.ngOnInit();
        await Promise.resolve();
        component.addRule();
        component.rules[0].pattern = 'admin';

        component.onSubmit();
        await Promise.resolve();

        expect(appCommon.updateManagerConfig).toHaveBeenCalled();
        const saved = JSON.parse(appCommon.updateManagerConfig.calls.mostRecent().args[0]);
        expect(saved.playerNameFilter).toEqual([{ pattern: 'admin', matchType: 'contains' }]);
        expect(component.outcomeBadge?.success).toBeTrue();
    });

    it('leaves blank defaults out of the saved config', async () => {
        appCommon.fetchManagerConfig.and.returnValue(of(JSON.stringify({
            playerNameFilter: [{ pattern: 'admin' }],
        })));

        component.ngOnInit();
        await Promise.resolve();
        component.onSubmit();
        await Promise.resolve();

        const saved = JSON.parse(appCommon.updateManagerConfig.calls.mostRecent().args[0]);
        expect('playerNameFilterReason' in saved).toBeFalse();
        expect('playerNameFilterPollIntervall' in saved).toBeFalse();
        expect(saved.playerNameFilter).toEqual([{ pattern: 'admin' }]);
    });

    it('keeps the configured values when they are set', async () => {
        component.ngOnInit();
        await Promise.resolve();
        component.addRule();
        component.rules[0].pattern = 'admin';
        component.config!.playerNameFilterPollIntervall = 0;

        component.onSubmit();
        await Promise.resolve();

        const saved = JSON.parse(appCommon.updateManagerConfig.calls.mostRecent().args[0]);
        expect(saved.playerNameFilterReason).toBe('change your name');
        expect(saved.playerNameFilterPollIntervall).toBe(0);
    });

    it('surfaces a failing save', async () => {
        appCommon.updateManagerConfig.and.returnValue(throwError(() => new Error('nope')));
        component.ngOnInit();
        await Promise.resolve();
        component.addRule();
        component.rules[0].pattern = 'admin';

        component.onSubmit();
        await Promise.resolve();

        expect(component.outcomeBadge?.success).toBeFalse();
        expect(component.saving).toBeFalse();
    });
});

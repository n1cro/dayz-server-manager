import { Component, OnInit } from '@angular/core';
import { Config, PlayerNameFilterMatchType, PlayerNameFilterRule } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import * as commentJson from 'comment-json';
import { firstValueFrom } from 'rxjs';

export const MATCH_TYPES: { value: PlayerNameFilterMatchType; label: string; hint: string }[] = [
    { value: 'contains', label: 'Contains', hint: 'The name contains the pattern anywhere' },
    { value: 'exact', label: 'Exact', hint: 'The whole name equals the pattern' },
    { value: 'regex', label: 'Regex', hint: 'The pattern is a regular expression' },
];

@Component({
    standalone: false,
    selector: 'sb-moderation',
    templateUrl: './moderation.component.html',
    styleUrls: ['moderation.component.scss'],
})
export class ModerationComponent implements OnInit {

    public matchTypes = MATCH_TYPES;

    public config?: Config;
    public loading = true;
    public saving = false;

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

    public constructor(
        private appCommon: AppCommonService,
    ) {}

    public ngOnInit(): void {
        this.reset();
    }

    public get rules(): PlayerNameFilterRule[] {
        return this.config?.playerNameFilter ?? [];
    }

    /**
     * What a rule without its own reason ends up using. A config written
     * before this page existed has no default reason of its own, so the
     * manager's fallback is named instead of rendering an empty binding.
     */
    public get defaultReasonPlaceholder(): string {
        return this.config?.playerNameFilterReason?.trim() || 'Manager default';
    }

    public reset(): void {
        this.loading = true;
        this.outcomeBadge = undefined;
        firstValueFrom(this.appCommon.fetchManagerConfig()).then(
            (config) => {
                this.config = commentJson.parse(config) as any;
                if (this.config) {
                    this.config.playerNameFilter = this.config.playerNameFilter || [];
                }
                this.loading = false;
            },
            (err) => {
                console.error(err);
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Failed to load config. See manager logs for details',
                    success: false,
                };
            },
        );
    }

    public addRule(): void {
        this.config?.playerNameFilter.push({
            pattern: '',
            matchType: 'contains',
        });
    }

    public removeRule(index: number): void {
        this.config?.playerNameFilter.splice(index, 1);
    }

    /**
     * A rule with an unusable pattern would silently never match, so saving is
     * blocked until it is either fixed or removed.
     */
    public ruleError(rule: PlayerNameFilterRule): string | undefined {
        if (!rule.pattern?.trim()) {
            return 'Pattern must not be empty';
        }
        if (rule.matchType === 'regex') {
            try {
                // eslint-disable-next-line no-new
                new RegExp(rule.pattern.trim(), 'i');
            } catch (e) {
                return `Invalid regular expression: ${(e as Error).message}`;
            }
        }
        return undefined;
    }

    public get hasErrors(): boolean {
        return this.rules.some((rule) => !!this.ruleError(rule));
    }

    /**
     * A config written before this page existed has no moderation keys at all,
     * so the inputs start out empty. Sending those empty values back would
     * store a blank reason and a sweep interval of null, which silently turns
     * the sweep off - leaving them out instead lets the manager fall back to
     * its own defaults.
     *
     * The copy keeps the comment-json symbols so saving does not strip the
     * documentation from server-manager.json.
     */
    private buildPayload(config: Config): Config {
        const payload = commentJson.assign({} as Config, config);

        if (!payload.playerNameFilterReason?.trim()) {
            delete (payload as Partial<Config>).playerNameFilterReason;
        }

        const interval = payload.playerNameFilterPollIntervall;
        if (interval === null || interval === undefined || isNaN(interval) || interval < 0) {
            delete (payload as Partial<Config>).playerNameFilterPollIntervall;
        }

        return payload;
    }

    public onSubmit(): void {
        if (!this.config || this.hasErrors) {
            this.outcomeBadge = {
                message: 'Fix the highlighted rules before saving',
                success: false,
            };
            return;
        }

        this.saving = true;
        this.outcomeBadge = undefined;
        firstValueFrom(this.appCommon.updateManagerConfig(
            commentJson.stringify(this.buildPayload(this.config)),
        )).then(
            () => {
                this.saving = false;
                this.outcomeBadge = {
                    message: 'Successfully updated the name blacklist',
                    success: true,
                };
            },
            (err) => {
                console.error(err);
                this.saving = false;
                this.outcomeBadge = {
                    message: 'Failed to update config. See manager logs for details',
                    success: false,
                };
            },
        );
    }

}

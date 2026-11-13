/* tslint:disable: ordered-imports*/
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

/* Module */
import { ModerationModule } from './moderation.module';
import { ModerationComponent } from './containers/moderation/moderation.component';
import { SBRouteData } from '../navigation/models';

/* Routes */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ROUTES: Routes = [
    {
        path: '',
        canActivate: [],
        component: ModerationComponent,
        data: {
            title: 'Moderation',
            breadcrumbs: [
                {
                    text: 'Dashboard',
                    link: '/dashboard',
                },
                {
                    text: 'Moderation',
                    active: true,
                },
            ],
        } as SBRouteData,
    },
];

@NgModule({
    imports: [ModerationModule, RouterModule.forChild(ROUTES)],
    exports: [RouterModule],
})
export class ModerationRoutingModule {}

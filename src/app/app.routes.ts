import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SuperAdminComponent } from './components/super-admin/super-admin.component';
import { IcAdminComponent } from './components/ic-admin/ic-admin.component';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'admin', component: SuperAdminComponent },
  { path: 'ic-admin', component: IcAdminComponent },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' }
];

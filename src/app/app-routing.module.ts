import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ListenerComponent } from './listener/listener.component';
import { ListenersComponent } from './listeners/listeners.component';
import { NavComponent } from './nav/nav.component';
import { StationComponent } from './station/station.component';
import { StationsComponent } from './stations/stations.component';

const routes: Routes = [
  { path: '', component: NavComponent },
  { path: 'stations', component: StationsComponent },
  { path: 'stations/:id', component: StationComponent },
  { path: 'listeners', component: ListenersComponent },
  { path: 'listeners/:id', component: ListenerComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

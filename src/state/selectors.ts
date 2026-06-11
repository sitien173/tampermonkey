import { AppState } from './types';

export const selectConfig = (state: AppState) => state.config;
export const selectLicense = (state: AppState) => state.license;
export const selectUI = (state: AppState) => state.ui;
export const selectSyncPhase = (state: AppState) => state.sync.phase;

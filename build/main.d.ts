import * as utils from '@iobroker/adapter-core';
import * as schedule from 'node-schedule';
import { myIob } from './lib/myIob.js';
import { SpApi } from './lib/api/sp-api.js';
import { PrognoseHourly } from './lib/myTypes.js';
declare class Solarprognose extends utils.Adapter {
    spApi: SpApi;
    myIob: myIob;
    statesUsingValAsLastChanged: string[];
    cacheToday: PrognoseHourly[];
    updateSchedule: schedule.Job | undefined;
    interpolationSchedule: schedule.Job | undefined;
    testMode: boolean;
    constructor(options?: Partial<utils.AdapterOptions>);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady;
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    private onUnload;
    /**
     * Is called if a subscribed state changes
     *
     * @param id
     * @param state
     */
    private onStateChange;
    /**
     * Download and update the data
     *
     * @param isAdapterStart
     */
    private updateData;
    /**
     * Transform downloaded data in an useful structure and enrich it with energy data's for today
     *
     * @param progData
     * @returns
     */
    private transformData;
    /**
     * Check the next api polling time, proposed by the last api call it self
     *
     * @param preferredNextApiRequestAt
     * @returns
     */
    private getNextUpdateTime;
    /**
     * set next polling time
     *
     * @param nextUpdateTime
     */
    private nextPolling;
    /**
     * Update adapter calculated energy states of today
     */
    private updateCalcedEnergyToday;
    /**
     * Calculate energy values of today
     *
     * @returns
     */
    private getCalcedEnergyToday;
    /**
     * calculate the accuracy of the forecast data of today. Compare it with own defined pv production state.
     *
     */
    private calcAccuracy;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): Solarprognose;
export {};

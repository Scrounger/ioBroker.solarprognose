import * as utils from '@iobroker/adapter-core';
import * as schedule from 'node-schedule';
import { myIob } from './lib/myIob.js';
import { SpApi } from './lib/api/sp-api.js';
declare class Solarprognose extends utils.Adapter {
    spApi: SpApi;
    myIob: myIob;
    statesUsingValAsLastChanged: string[];
    testMode: boolean;
    apiEndpoint: string;
    updateSchedule: schedule.Job | undefined;
    hourlySchedule: schedule.Job | undefined;
    interpolationSchedule: schedule.Job | undefined;
    solarData: {
        [key: number]: Array<number>;
    } | undefined;
    myTranslation: {
        [key: string]: any;
    } | undefined;
    constructor(options?: Partial<utils.AdapterOptions>);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady;
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload;
    /**
     * Is called if a subscribed state changes
     */
    private onStateChange;
    private updateData;
    private transformData;
    private getNextUpdateTime;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): Solarprognose;
export {};

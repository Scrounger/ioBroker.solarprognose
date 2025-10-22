/*
 * Created with @iobroker/create-adapter v2.6.5
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import * as schedule from 'node-schedule';
import * as tree from './lib/tree/index.js';
import { myIob } from './lib/myIob.js';
import { SpApi } from './lib/api/sp-api.js';
class Solarprognose extends utils.Adapter {
    spApi;
    myIob;
    statesUsingValAsLastChanged = [
        'lastUpdate'
    ];
    testMode = false;
    apiEndpoint = 'https://www.solarprognose.de/web/solarprediction/api/v1';
    updateSchedule = undefined;
    hourlySchedule = undefined;
    interpolationSchedule = undefined;
    solarData = undefined;
    myTranslation;
    constructor(options = {}) {
        super({
            ...options,
            name: 'solarprognose',
            useFormatDate: true
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const logPrefix = '[onReady]:';
        try {
            moment.locale(this.language);
            await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);
            this.myIob = new myIob(this, utils, this.statesUsingValAsLastChanged);
            this.spApi = new SpApi(this);
            if (this.config.project && this.config.accessToken && this.config.solarprognoseId) {
                await this.updateData(true);
                this.myIob.findMissingTranslation();
            }
            else {
                this.log.error(`${logPrefix} project, token, device id and / or access token missing. Please check your adapter configuration!`);
            }
            // // Initialize your adapter here
            // await this.loadTranslation();
            // await this.updateData();
            // if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && (await this.foreignObjectExists(this.config.todayEnergyObject))) {
            // 	await this.subscribeForeignStatesAsync(this.config.todayEnergyObject);
            // }
            // this.hourlySchedule = schedule.scheduleJob('0 * * * *', async () => {
            // 	this.updateCalcedEnergy();
            // 	this.calcAccuracy();
            // });
            // if (this.config.dailyInterpolation) {
            // 	this.interpolationSchedule = schedule.scheduleJob('*/5 * * * *', async () => {
            // 		this.updateCalcedEnergy();
            // 		this.calcAccuracy();
            // 	});
            // }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            if (this.updateSchedule)
                this.updateSchedule.cancel();
            if (this.hourlySchedule)
                this.hourlySchedule.cancel();
            if (this.interpolationSchedule)
                this.interpolationSchedule.cancel();
            callback();
            // eslint-disable-next-line
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        if (state) {
            if (id = this.config.todayEnergyObject) {
                // this.updateCalcedEnergy();
                // this.calcAccuracy();
            }
            // The state was changed
            // this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        }
        else {
            // The state was deleted
            // this.log.info(`state ${id} deleted`);
        }
    }
    async updateData(isAdapterStart = false) {
        const logPrefix = '[updateData]:';
        let nextUpdateTime = undefined;
        try {
            const result = await this.spApi.getHourlyData();
            if (result) {
                const myData = this.transformData(result);
                await this.myIob.createOrUpdateStates(this.namespace, tree.prognose.get(), myData, myData, undefined, false, undefined, isAdapterStart);
                nextUpdateTime = this.getNextUpdateTime(result.preferredNextApiRequestAt);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        if (nextUpdateTime) {
            this.updateSchedule = schedule.scheduleJob(nextUpdateTime.toDate(), async () => {
                this.updateData();
            });
        }
        else {
            this.log.warn(`${logPrefix} no next update time receive, try again in 1 hour`);
            this.updateSchedule = schedule.scheduleJob(moment().add(1, 'hours').toDate(), async () => {
                this.updateData();
            });
        }
    }
    transformData(progData) {
        const logPrefix = '[updateData]:';
        try {
            let result = [];
            const json = [];
            const groupedByDate = {};
            if (progData.data) {
                for (const [timestampStr, [power, energy]] of Object.entries(progData.data)) {
                    const timestamp = parseInt(timestampStr) * 1000;
                    const momentTs = moment(timestamp);
                    const timeStr = momentTs.format(`ddd ${this.dateFormat} HH:mm:ss`);
                    const day = momentTs.startOf('day').unix();
                    const diffDays = momentTs.diff(moment().startOf('day'), 'days');
                    if (diffDays <= this.config.dailyMax) {
                        if (!groupedByDate[day]) {
                            groupedByDate[day] = [];
                        }
                        groupedByDate[day].push({ human: timeStr, timestamp, power, energy });
                        if (this.config.jsonTableEnabled) {
                            json.push({ human: timeStr, timestamp, power, energy });
                        }
                    }
                }
                const sortedDays = Object.keys(groupedByDate)
                    .map(Number)
                    .sort((a, b) => a - b);
                result = sortedDays.map(day => {
                    const hourlySorted = groupedByDate[day].sort((a, b) => a.timestamp - b.timestamp);
                    const lastEnergy = hourlySorted.length > 0 ? hourlySorted[hourlySorted.length - 1].energy : null;
                    const result = {
                        energy: lastEnergy,
                        hourly: hourlySorted,
                    };
                    if (day === moment().startOf('day').unix()) {
                        // Today data
                        const nowTimestamp = moment().startOf('hour').unix() * 1000;
                        if (nowTimestamp < hourlySorted[0].timestamp) {
                            // before first entry of day
                            result.energy_now = 0;
                            result.energy_from_now = lastEnergy;
                        }
                        else if (nowTimestamp > hourlySorted[hourlySorted.length - 1].timestamp) {
                            // after last entry of day
                            result.energy_now = lastEnergy;
                            result.energy_from_now = 0;
                        }
                        else {
                            // between first and last entry of day
                            const hourNow = hourlySorted.find(x => x.timestamp === moment().startOf('hour').unix() * 1000);
                            if (hourNow) {
                                const hourNext = hourlySorted[hourlySorted.indexOf(hourNow) + 1];
                                if (hourNext && this.config.dailyInterpolation) {
                                    const energyNow = Math.round((hourNow.energy + (hourNext.energy - hourNow.energy) / 60 * moment().minutes()) * 1000) / 1000;
                                    result.energy_now = energyNow;
                                    result.energy_from_now = lastEnergy - energyNow;
                                }
                                else {
                                    result.energy_now = hourNow.energy;
                                    result.energy_from_now = lastEnergy - hourNow.energy;
                                }
                            }
                            else {
                                this.log.error(`${logPrefix} data for current hour not found!`);
                            }
                        }
                    }
                    return result;
                });
            }
            return {
                forecast: result,
                json: json.sort((a, b) => a.timestamp - b.timestamp),
                status: progData.status,
                lastUpdate: moment().unix() * 1000
            };
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    getNextUpdateTime(preferredNextApiRequestAt) {
        const logPrefix = '[getNextUpdateTime]:';
        let nextUpdate = moment().add(1, 'hours');
        try {
            if (preferredNextApiRequestAt && preferredNextApiRequestAt.epochTimeUtc) {
                const nextApiRequestLog = moment(preferredNextApiRequestAt.epochTimeUtc * 1000).format(`ddd ${this.dateFormat} HH:mm:ss`);
                if (!moment().isBefore(moment(preferredNextApiRequestAt.epochTimeUtc * 1000))) {
                    // 'preferredNextApiRequestAt' is in the past
                    this.log.debug(`${logPrefix} preferredNextApiRequestAt: '${nextApiRequestLog}' is in the past! Next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
                }
                else if ((moment(preferredNextApiRequestAt.epochTimeUtc * 1000).diff(moment()) / (1000 * 60 * 60)) >= 1.1) {
                    // 'preferredNextApiRequestAt' is more than one hour in the future
                    this.log.debug(`${logPrefix} preferredNextApiRequestAt: '${nextApiRequestLog}' is more than one hour in the future! Next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
                }
                else {
                    // using 'preferredNextApiRequestAt'
                    nextUpdate = moment(preferredNextApiRequestAt.epochTimeUtc * 1000);
                    this.log.debug(`${logPrefix} next update: ${moment(preferredNextApiRequestAt.epochTimeUtc * 1000).format(`ddd ${this.dateFormat} HH:mm:ss`)} by 'preferredNextApiRequestAt'`);
                }
            }
            else {
                this.log.debug(`${logPrefix} no 'preferredNextApiRequestAt' exist, next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
            }
        }
        catch (err) {
            console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
        }
        return nextUpdate;
    }
}
// replace only needed for dev system
const modulePath = url.fileURLToPath(import.meta.url).replace('/development/', '/node_modules/');
if (process.argv[1] === modulePath) {
    // start the instance directly
    new Solarprognose();
}
export default function startAdapter(options) {
    // compact mode
    return new Solarprognose(options);
}

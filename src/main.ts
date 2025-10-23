/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import * as schedule from 'node-schedule';

import * as tree from './lib/tree/index.js'
import * as myHelper from './lib/helper.js';
import { myIob } from './lib/myIob.js';
import { SpApi } from './lib/api/sp-api.js';
import { Prognose, PrognoseDaily, PrognoseHourly } from './lib/myTypes.js';
import { SolarPrognoseData, SolarPrognosePreferredNextApiRequestAt } from './lib/api/sp-types-hourly.js';
import _ from 'lodash';

class Solarprognose extends utils.Adapter {
	spApi: SpApi;
	myIob: myIob;

	statesUsingValAsLastChanged = [          // id of states where lc is taken from the value
		'lastUpdate'
	];

	cacheToday: PrognoseHourly[] = [];

	updateSchedule: schedule.Job | undefined = undefined;
	interpolationSchedule: schedule.Job | undefined = undefined;

	public testMode = false;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
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
	private async onReady(): Promise<void> {
		const logPrefix = '[onReady]:';

		try {
			moment.locale(this.language);

			await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

			this.myIob = new myIob(this, utils, this.statesUsingValAsLastChanged);
			this.spApi = new SpApi(this);

			if (this.config.project && this.config.accessToken && this.config.solarprognoseId) {
				await this.updateData(true);

				this.myIob.findMissingTranslation();
			} else {
				this.log.error(`${logPrefix} project, token, device id and / or access token missing. Please check your adapter configuration!`);
			}

			if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && (await this.foreignObjectExists(this.config.todayEnergyObject))) {
				await this.subscribeForeignStatesAsync(this.config.todayEnergyObject);
			}

			if (this.config.dailyEnabled && this.config.dailyInterpolation) {
				this.interpolationSchedule = schedule.scheduleJob('*/1 * * * *', async () => {
					await this.updateCalcedEnergyToday();
				});
			}

			for (let i = this.config.dailyMax + 1; i <= 20; i++) {
				const idChannel = `${tree.prognose.idChannel}.${myHelper.zeroPad(i, 2)}`
				if (await this.objectExists(idChannel)) {
					await this.delObjectAsync(idChannel, { recursive: true });
				}
			}

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * 
	 * @param callback
	 */
	private onUnload(callback: () => void): void {
		try {
			if (this.updateSchedule) {
				this.updateSchedule.cancel();
			}
			if (this.interpolationSchedule) {
				this.interpolationSchedule.cancel();
			}

			callback();
		} catch (e: any) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * 
	 * @param id 
	 * @param state 
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		const logPrefix = '[onStateChange]:';

		try {
			if (state) {
				if (state.from.includes(this.namespace)) {
					// internal changes
					await this.calcAccuracy();
				} else if (id === this.config.todayEnergyObject) {
					await this.calcAccuracy();
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Download and update the data
	 * 
	 * @param isAdapterStart 
	 */
	private async updateData(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateData]:';

		let nextUpdateTime = undefined;

		try {
			const result = await this.spApi.getHourlyData();

			if (result) {
				const myData = this.transformData(result);

				await this.myIob.createOrUpdateStates(this.namespace, tree.prognose.get(), myData, myData, undefined, false, undefined, isAdapterStart);
				await this.calcAccuracy();

				nextUpdateTime = this.getNextUpdateTime(result.preferredNextApiRequestAt);
			}

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		this.nextPolling(nextUpdateTime);
	}

	/**
	 * Transform downloaded data in an useful structure and enrich it with energy data's for today
	 * 
	 * @param progData 
	 * @returns 
	 */
	private transformData(progData: SolarPrognoseData): Prognose | undefined {
		const logPrefix = '[updateData]:';

		try {
			let result = [];
			const json: PrognoseHourly[] = [];
			const groupedByDate: { [date: number]: PrognoseHourly[] } = {};

			if (progData.data) {
				for (const [timestampStr, [power, energy]] of Object.entries(progData.data)) {
					const timestamp = parseInt(timestampStr) * 1000;
					const momentTs = moment(timestamp);

					const timeStr = momentTs.format(`ddd ${this.dateFormat} HH:mm:ss`);
					const day = momentTs.startOf('day').unix();

					const diffDays = momentTs.diff(moment().startOf('day'), 'days');

					if (diffDays >= 0 && diffDays <= this.config.dailyMax) {
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

				result = sortedDays.map((day) => {
					const hourlySorted = groupedByDate[day].sort((a, b) => a.timestamp - b.timestamp);
					const lastEnergy = hourlySorted.length > 0 ? hourlySorted[hourlySorted.length - 1].energy : null;

					const result: PrognoseDaily = {
						energy: lastEnergy,
						hourly: hourlySorted,
					}

					if (day === moment().startOf('day').unix() && this.config.dailyEnabled) {
						this.cacheToday = hourlySorted;

						const calcedEnergy = this.getCalcedEnergyToday();

						result.energy_now = calcedEnergy.energy_now;
						result.energy_from_now = calcedEnergy.energy_from_now;

						if (this.config.accuracyEnabled) {
							result.accuracy = 0;
						}
					}

					this.log.debug(`${logPrefix} day ${moment(day * 1000).format(this.dateFormat)} - ${JSON.stringify(result)}`);
					return result;
				});
			}

			return {
				forecast: result,
				json: json.sort((a, b) => a.timestamp - b.timestamp),
				status: progData.status,
				lastUpdate: moment().unix() * 1000
			};
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		return undefined;
	}

	/**
	 * Check the next api polling time, proposed by the last api call it self
	 * 
	 * @param preferredNextApiRequestAt 
	 * @returns 
	 */
	private getNextUpdateTime(preferredNextApiRequestAt: SolarPrognosePreferredNextApiRequestAt | undefined): moment.Moment {
		const logPrefix = '[getNextUpdateTime]:';

		let nextUpdate = moment().add(1, 'hours');

		try {
			if (preferredNextApiRequestAt && preferredNextApiRequestAt.epochTimeUtc) {
				const nextApiRequestLog = moment(preferredNextApiRequestAt.epochTimeUtc * 1000).format(`ddd ${this.dateFormat} HH:mm:ss`);

				if (!moment().isBefore(moment(preferredNextApiRequestAt.epochTimeUtc * 1000))) {
					// 'preferredNextApiRequestAt' is in the past
					this.log.debug(`${logPrefix} preferredNextApiRequestAt: '${nextApiRequestLog}' is in the past! Next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
				} else if ((moment(preferredNextApiRequestAt.epochTimeUtc * 1000).diff(moment()) / (1000 * 60 * 60)) >= 1.1) {
					// 'preferredNextApiRequestAt' is more than one hour in the future
					this.log.debug(`${logPrefix} preferredNextApiRequestAt: '${nextApiRequestLog}' is more than one hour in the future! Next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
				} else {
					// using 'preferredNextApiRequestAt'
					nextUpdate = moment(preferredNextApiRequestAt.epochTimeUtc * 1000);
					this.log.debug(`${logPrefix} next update: ${moment(preferredNextApiRequestAt.epochTimeUtc * 1000).format(`ddd ${this.dateFormat} HH:mm:ss`)} by 'preferredNextApiRequestAt'`);
				}
			} else {
				this.log.debug(`${logPrefix} no 'preferredNextApiRequestAt' exist, next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
			}

		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}

		return nextUpdate;
	}

	/**
	 * set next polling time
	 * 
	 * @param nextUpdateTime 
	 */
	private nextPolling(nextUpdateTime: moment.Moment | undefined): void {
		const logPrefix = '[nextPolling]:';

		try {
			if (nextUpdateTime) {
				this.updateSchedule = schedule.scheduleJob(nextUpdateTime.toDate(), async () => {
					await this.updateData();
				});
			} else {
				this.log.warn(`${logPrefix} no next update time receive, try again in 1 hour`);
				this.updateSchedule = schedule.scheduleJob(moment().add(1, 'hours').toDate(), async () => {
					await this.updateData();
				});
			}

		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * Update adapter calculated energy states of today
	 */
	private async updateCalcedEnergyToday(): Promise<void> {
		const logPrefix = '[updateCalcedEnergyToday]:';

		try {
			if (this.config.dailyEnabled && this.cacheToday && this.cacheToday.length > 0) {
				const result = this.getCalcedEnergyToday();

				await this.setStateChangedAsync(`${tree.prognose.idChannel}.00.energy_from_now`, Math.round(result.energy_from_now * 1000) / 1000, true);
				await this.setStateChangedAsync(`${tree.prognose.idChannel}.00.energy_now`, Math.round(result.energy_now * 1000) / 1000, true);
			}
		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * Calculate energy values of today
	 * 
	 * @returns 
	 */
	private getCalcedEnergyToday(): { energy_now: number; energy_from_now: number; } {
		const logPrefix = '[getCalcedEnergyToday]:';

		const result = {
			energy_now: 0,
			energy_from_now: 0
		}

		try {
			if (this.cacheToday && this.cacheToday.length > 0) {
				const firstItem = this.cacheToday.length > 0 ? this.cacheToday[0] : null;
				const lastItem = this.cacheToday.length > 0 ? this.cacheToday[this.cacheToday.length - 1] : null;
				const nowTimestamp = moment().startOf('hour').unix() * 1000;

				if (nowTimestamp < firstItem.timestamp) {
					// before first entry of day
					result.energy_now = 0;
					result.energy_from_now = _.round(lastItem.energy, 3);

					this.log.debug(`${logPrefix} now is before first item (${moment(firstItem.timestamp).format('HH:mm')}h) of today (result: ${JSON.stringify(result)})`);
				} else if (nowTimestamp > lastItem.timestamp) {
					// after last entry of day
					result.energy_now = _.round(lastItem.energy, 3);
					result.energy_from_now = 0;

					this.log.debug(`${logPrefix} now is after last item (${moment(lastItem.timestamp).format('HH:mm')}h) of today (result: ${JSON.stringify(result)})`);
				} else {
					// between first and last entry of day
					const hourNow = this.cacheToday.find(x => x.timestamp === moment().startOf('hour').unix() * 1000);

					if (hourNow) {
						const hourNext = this.cacheToday[this.cacheToday.indexOf(hourNow) + 1];

						if (hourNext && this.config.dailyInterpolation) {
							const energyNow = Math.round((hourNow.energy + (hourNext.energy - hourNow.energy) / 60 * moment().minutes()) * 1000) / 1000;
							result.energy_now = _.round(energyNow, 3);
							result.energy_from_now = _.round(lastItem.energy - energyNow, 3);

							this.log.debug(`${logPrefix} now is between ${moment(hourNow.timestamp).format('HH:mm')}h - ${moment(hourNext.timestamp).format('HH:mm')}h (interpolated result: ${JSON.stringify(result)})`);
						} else {
							result.energy_now = _.round(hourNow.energy, 3);
							result.energy_from_now = _.round(lastItem.energy - hourNow.energy, 3);

							this.log.debug(`${logPrefix} now is between ${moment(hourNow.timestamp).format('HH:mm')}h - ${moment(hourNext.timestamp).format('HH:mm')}h (result: ${JSON.stringify(result)})`);
						}
					} else {
						this.log.error(`${logPrefix} data for current hour not found!`);
					}
				}
			} else {
				this.log.error(`${logPrefix} no cached data for today exists!`);
			}
		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}

		return result;
	}

	/**
	 * calculate the accuracy of the forecast data of today. Compare it with own defined pv production state.
	 * 
	 */
	private async calcAccuracy(): Promise<void> {
		const logPrefix = '[calcAccuracy]:';

		try {
			if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && (await this.foreignObjectExists(this.config.todayEnergyObject))) {
				const energy_now = await this.getStateAsync(`${tree.prognose.idChannel}.00.energy_now`);
				const energy_pv = await this.getForeignStateAsync(this.config.todayEnergyObject);

				let calc = 0;

				if (energy_now && (energy_now.val as number) > 0) {
					if ((energy_pv.val as number) <= (energy_now.val as number)) {
						calc = Math.round((energy_pv.val as number) / (energy_now.val as number) * 100);
					} else {
						calc = Math.round((energy_now.val as number) / (energy_pv.val as number) * 100);
					}
				}

				await this.setStateChangedAsync(`${tree.prognose.idChannel}.00.accuracy`, calc, true);
			}
		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}
	}
}

// replace only needed for dev system
const modulePath = url.fileURLToPath(import.meta.url).replace('/development/', '/node_modules/');

if (process.argv[1] === modulePath) {
	// start the instance directly
	new Solarprognose();
}

export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): Solarprognose {
	// compact mode
	return new Solarprognose(options);
}
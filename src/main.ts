/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import * as schedule from 'node-schedule';

import * as myHelper from './lib/helper.js';
import * as tree from './lib/tree/index.js'
import { myIob, myTreeState } from './lib/myIob.js';
import { SpApi } from './lib/api/sp-api.js';
import { Prognose, PrognoseDaily, PrognoseHourly, preferredNextApiRequestAt } from './lib/myTypes.js';
import { SolarPrognoseData } from './lib/api/sp-types-hourly.js';

class Solarprognose extends utils.Adapter {
	spApi: SpApi;
	myIob: myIob;

	statesUsingValAsLastChanged = [          // id of states where lc is taken from the value
		'lastUpdate'
	];

	public testMode = true;

	apiEndpoint = 'https://www.solarprognose.de/web/solarprediction/api/v1';
	updateSchedule: schedule.Job | undefined = undefined;
	hourlySchedule: schedule.Job | undefined = undefined;
	interpolationSchedule: schedule.Job | undefined = undefined;
	solarData: { [key: number]: Array<number> } | undefined = undefined;
	myTranslation: { [key: string]: any; } | undefined;

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

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			if (this.updateSchedule) this.updateSchedule.cancel();
			if (this.hourlySchedule) this.hourlySchedule.cancel();
			if (this.interpolationSchedule) this.interpolationSchedule.cancel();

			callback();

			// eslint-disable-next-line
		} catch (e: any) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (state) {
			if (id = this.config.todayEnergyObject) {
				// this.updateCalcedEnergy();
				// this.calcAccuracy();
			}
			// The state was changed
			// this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			// this.log.info(`state ${id} deleted`);
		}
	}

	private async updateData(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateData]:';

		try {
			const result = await this.spApi.getHourlyData();

			if (result) {
				const myData = this.transformData(result);

				this.log.warn(JSON.stringify(myData));

				this.myIob.createOrUpdateStates(this.namespace, tree.prognose.get(), myData, myData, undefined, false, undefined, true);
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}


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

					const result: PrognoseDaily = {
						energy: lastEnergy,
						hourly: hourlySorted,
					}

					if (day === moment().startOf('day').unix()) {
						// Today data
						const nowTimestamp = moment().startOf('hour').unix() * 1000;

						if (nowTimestamp < hourlySorted[0].timestamp) {
							// before first entry of day
							result.energy_now = 0;
							result.energy_from_now = lastEnergy;
						} else if (nowTimestamp > hourlySorted[hourlySorted.length - 1].timestamp) {
							// after last entry of day
							result.energy_now = lastEnergy;
							result.energy_from_now = 0;
						} else {
							// between first and last entry of day
							const hourNow = hourlySorted.find(x => x.timestamp === moment().startOf('hour').unix() * 1000);

							if (hourNow) {
								const hourNext = hourlySorted[hourlySorted.indexOf(hourNow) + 1];

								if (hourNext && this.config.dailyInterpolation) {
									const energyNow = Math.round((hourNow.energy + (hourNext.energy - hourNow.energy) / 60 * moment().minutes()) * 1000) / 1000;
									result.energy_now = energyNow;
									result.energy_from_now = lastEnergy - energyNow;
								} else {
									result.energy_now = hourNow.energy;
									result.energy_from_now = lastEnergy - hourNow.energy;
								}
							} else {
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
				lastUpdate: moment().startOf('hour').unix() * 1000
			};
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		return undefined;
	}

	// private async updateData(): Promise<void> {
	// 	const logPrefix = '[updateData]:';

	// 	let nextUpdateTime = undefined;

	// 	try {
	// 		if (this.config.project && this.config.accessToken && this.config.solarprognoseItem && this.config.solarprognoseId) {
	// 			const url = `${this.apiEndpoint}?access-token=${this.config.accessToken}&project=${this.config.project}&item=${this.config.solarprognoseItem}&id=${this.config.solarprognoseId}&algorithm=${this.config.solarprognoseAlgorithm}&type=hourly&_format=json`;
	// 			const response = await this.downloadData(url);



	// 			this.log.silly(JSON.stringify(response));

	// 			if (response) {
	// 				if (response.status === 0) {
	// 					await this.createOrUpdateState(this.namespace, myTypes.stateDefinition['statusResponse'], response.status, 'statusResponse', true);
	// 					this.solarData = response.data;

	// 					await this.processData();
	// 					await this.updateCalcedEnergy();
	// 					await this.calcAccuracy();

	// 					if (this.updateSchedule) this.updateSchedule.cancel()
	// 					nextUpdateTime = this.getNextUpdateTime(response.preferredNextApiRequestAt);

	// 					await this.createOrUpdateState(this.namespace, myTypes.stateDefinition['lastUpdate'], moment().format(`ddd ${this.dateFormat} HH:mm:ss`), 'lastUpdate');

	// 					this.log.info(`${logPrefix} data successfully updated, next update: ${nextUpdateTime.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);

	// 				} else {
	// 					//@ts-ignore
	// 					this.log.error(`${logPrefix} data received with error code: ${response.status} - ${myTypes.stateDefinition.statusResponse.common.states[response.status]}`);
	// 				}
	// 			} else {
	// 				this.log.error(`${logPrefix} no data received!`);
	// 			}
	// 		} else {
	// 			this.log.error(`${logPrefix} settings missing. Please check your adapter configuration!`);
	// 		}
	// 	} catch (error: any) {
	// 		this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
	// 	}

	// 	if (nextUpdateTime) {
	// 		this.updateSchedule = schedule.scheduleJob(nextUpdateTime.toDate(), async () => {
	// 			this.updateData();
	// 		});
	// 	} else {
	// 		this.log.warn(`${logPrefix} no next update time receive, try again in 1 hour`);
	// 		this.updateSchedule = schedule.scheduleJob(moment().add(1, 'hours').toDate(), async () => {
	// 			this.updateData();
	// 		});
	// 	}
	// }

	// private async processData(): Promise<void> {
	// 	const logPrefix = '[processData]:';

	// 	try {
	// 		if (this.solarData) {
	// 			const jsonResult: Array<myTypes.myJsonStructure> = [];

	// 			for (let i = 0; i <= Object.keys(this.solarData).length - 1; i++) {
	// 				const timestamp = parseInt(Object.keys(this.solarData)[i]);
	// 				const momentTs = moment(timestamp * 1000);
	// 				const arr = Object.values(this.solarData)[i];

	// 				if (!momentTs.isBefore(moment().startOf('day'))) {
	// 					// filter out past data
	// 					const diffDays = momentTs.diff(moment().startOf('day'), 'days');
	// 					const channelDayId = `${myHelper.zeroPad(diffDays, 2)}`;
	// 					const channelHourId = `${myHelper.zeroPad(momentTs.hours(), 2)}h`

	// 					if (diffDays <= this.config.dailyMax) {
	// 						jsonResult.push({
	// 							human: momentTs.format(`ddd ${this.dateFormat} HH:mm`),
	// 							timestamp: timestamp,
	// 							val: arr[0],
	// 							total: arr[1]
	// 						});
	// 					}

	// 					if (this.config.dailyEnabled && diffDays <= this.config.dailyMax) {
	// 						if (!Object.keys(this.solarData)[i + 1] || (Object.keys(this.solarData)[i + 1] && !momentTs.isSame(moment(parseInt(Object.keys(this.solarData)[i + 1]) * 1000), 'day'))) {
	// 							await this.createOrUpdateChannel(channelDayId, diffDays === 0 ? this.getTranslation('today') : diffDays === 1 ? this.getTranslation('tomorrow') : this.getTranslation('inXDays').replace('{0}', diffDays.toString()));

	// 							await this.createOrUpdateState(channelDayId, myTypes.stateDefinition['energy'], arr[1], 'energy');
	// 						}
	// 					} else {
	// 						if (this.config.dailyEnabled && diffDays <= this.config.dailyMax) {
	// 							if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition['energy'].id}`)) {
	// 								await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition['energy'].id}`);
	// 								this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition['energy'].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
	// 							}
	// 							if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition['energy_now'].id}`)) {
	// 								await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition['energy_now'].id}`);
	// 								this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition['energy_now'].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
	// 							}
	// 							if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition['energy_from_now'].id}`)) {
	// 								await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition['energy_from_now'].id}`);
	// 								this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition['energy_from_now'].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
	// 							}
	// 						} else {
	// 							if (await this.objectExists(`${channelDayId}`)) {
	// 								await this.delObjectAsync(`${channelDayId}`, { recursive: true });
	// 								this.log.info(`${logPrefix} deleting channel '${channelDayId}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
	// 							}
	// 						}
	// 					}

	// 					if (this.config.hourlyEnabled && diffDays <= this.config.dailyMax) {
	// 						await this.createOrUpdateChannel(`${channelDayId}.${channelHourId}`, this.getTranslation('xOClock').replace('{0}', momentTs.hour().toString()));

	// 						await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition['date'], momentTs.format(`ddd ${this.dateFormat} HH:mm`), 'date');
	// 						await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition['power'], arr[0], 'power');
	// 						await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition['energy'], arr[1], 'energy');
	// 					} else {
	// 						if (await this.objectExists(`${channelDayId}.${channelHourId}`)) {
	// 							await this.delObjectAsync(`${channelDayId}.${channelHourId}`, { recursive: true });
	// 							this.log.info(`${logPrefix} deleting channel '${channelDayId}.${channelHourId}' (config.hourlyEnabled: ${this.config.hourlyEnabled})`);
	// 						}
	// 					}
	// 				}
	// 			}

	// 			if (this.config.jsonTableEnabled) {
	// 				await this.createOrUpdateState(this.namespace, myTypes.stateDefinition['jsonTable'], JSON.stringify(jsonResult), 'jsonTable');
	// 			} else {
	// 				if (myTypes.stateDefinition['jsonTable'].id && await this.objectExists(myTypes.stateDefinition['jsonTable'].id)) {
	// 					await this.delObjectAsync(myTypes.stateDefinition['jsonTable'].id);
	// 					this.log.info(`${logPrefix} deleting state '${myTypes.stateDefinition['jsonTable'].id}' (config.jsonTableEnabled: ${this.config.jsonTableEnabled})`);
	// 				}
	// 			}

	// 		} else {
	// 			this.log.error(`${logPrefix} received data has no forecast data!`);
	// 		}

	// 	} catch (error: any) {
	// 		this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
	// 	}
	// }

	// private async updateCalcedEnergy(): Promise<void> {
	// 	const logPrefix = '[updateCalcedEnergy]:';

	// 	try {
	// 		if (this.config.dailyEnabled) {
	// 			const nowTs = moment().startOf('hour').unix();
	// 			const nextHourTs = moment().startOf('hour').add(1, 'hour').unix();

	// 			const idEnergy = `00.${myTypes.stateDefinition['energy'].id}`

	// 			if (await this.objectExists(idEnergy)) {
	// 				const energyTotalToday = await this.getStateAsync(idEnergy);

	// 				if (this.solarData && this.solarData[nowTs]) {
	// 					if (energyTotalToday && (energyTotalToday.val || energyTotalToday.val === 0)) {
	// 						let energyNow = this.solarData[nowTs][1];

	// 						if (this.config.dailyInterpolation && this.solarData[nextHourTs]) {
	// 							energyNow = Math.round((this.solarData[nowTs][1] + (this.solarData[nextHourTs][1] - this.solarData[nowTs][1]) / 60 * moment().minutes()) * 1000) / 1000;
	// 							this.log.debug(`${logPrefix} update energy_now with interpolation: ${energyNow} kWh (energy now: ${this.solarData[nowTs][1]}, energy next: ${this.solarData[nextHourTs][1]}, minutes: ${moment().minutes()}))`)
	// 						} else {
	// 							this.log.debug(`${logPrefix} update energy_now: ${energyNow} kWh (energy now: ${this.solarData[nowTs][1]})`);
	// 						}

	// 						await this.createOrUpdateState('00', myTypes.stateDefinition['energy_now'], energyNow, 'energy_now');
	// 						await this.createOrUpdateState('00', myTypes.stateDefinition['energy_from_now'], Math.round(((energyTotalToday.val as number) - energyNow) * 1000) / 1000, 'energy_from_now');
	// 					}
	// 				} else {
	// 					await this.createOrUpdateState('00', myTypes.stateDefinition['energy_now'], (energyTotalToday?.val as number), 'energy_now');
	// 					await this.createOrUpdateState('00', myTypes.stateDefinition['energy_from_now'], 0, 'energy_from_now');
	// 				}
	// 			}
	// 		}
	// 	} catch (error: any) {
	// 		this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
	// 	}
	// }

	// private async calcAccuracy(): Promise<void> {
	// 	const logPrefix = '[calcAccuracy]:';

	// 	try {
	// 		if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && (await this.foreignObjectExists(this.config.todayEnergyObject))) {
	// 			if (moment().hour() === 0) {
	// 				// reset at day change
	// 				await this.createOrUpdateState(`${this.namespace}.00`, myTypes.stateDefinition['accuracy'], 0, 'accuracy');
	// 				this.log.debug(`${logPrefix} reset accuracy because of new day started`);
	// 			} else {
	// 				const idEnergy = `00.${myTypes.stateDefinition['energy_now'].id}`

	// 				if ((await this.foreignObjectExists(this.config.todayEnergyObject)) && (await this.objectExists(idEnergy))) {

	// 					const forecastEnergy = await this.getStateAsync(idEnergy);
	// 					const todayEnergy = await this.getForeignStateAsync(this.config.todayEnergyObject);

	// 					if (forecastEnergy && forecastEnergy.val && todayEnergy && (todayEnergy.val || todayEnergy.val === 0)) {
	// 						const res = Math.round((todayEnergy.val as number) / (forecastEnergy.val as number) * 100) / 100;

	// 						this.log.debug(`${logPrefix} new accuracy: ${res} (energy now: ${forecastEnergy.val}, energyToday: ${todayEnergy.val}) `);

	// 						await this.createOrUpdateState(`${this.namespace}.00`, myTypes.stateDefinition['accuracy'], res, 'accuracy');
	// 					}
	// 				}
	// 			}
	// 		}
	// 	} catch (error: any) {
	// 		this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
	// 	}
	// }

	// private async downloadData(url: string): Promise<myTypes.dataStructure | undefined> {
	// 	const logPrefix = '[downloadData]:';

	// 	try {
	// 		if (!this.testMode) {
	// 			const response: any = await fetch(url);

	// 			if (response.status === 200) {
	// 				this.log.debug(`${logPrefix} data successfully received`);

	// 				return await response.json();
	// 			} else {
	// 				this.log.error(`${logPrefix} status code: ${response.status}`);
	// 			}
	// 		} else {
	// 			this.log.warn(`${logPrefix} Test mode is active!`);

	// 			const { default: data } = await import('../test/testData.json', { assert: { type: 'json' } });
	// 			return data;
	// 		}
	// 	} catch (error: any) {
	// 		this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
	// 	}

	// 	return undefined;
	// }

	private getNextUpdateTime(preferredNextApiRequestAt: preferredNextApiRequestAt | undefined): moment.Moment {
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
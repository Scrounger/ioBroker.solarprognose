/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';
import * as schedule from 'node-schedule';

import * as myTypes from './lib/myTypes';
import * as myHelper from './lib/helper';

class Solarprognose extends utils.Adapter {
	testMode = false;

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
			// Initialize your adapter here
			await this.loadTranslation();
			await this.updateData();

			if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && (await this.foreignObjectExists(this.config.todayEnergyObject))) {
				await this.subscribeForeignStatesAsync(this.config.todayEnergyObject);
			}

			this.hourlySchedule = schedule.scheduleJob('0 * * * *', async () => {
				this.updateCalcedEnergy();
				this.calcAccuracy();
			});

			if (this.config.dailyInterpolation) {
				this.interpolationSchedule = schedule.scheduleJob('*/5 * * * *', async () => {
					this.updateCalcedEnergy();
					this.calcAccuracy();
				});
			}

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

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  */
	// private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (state) {
			if (id = this.config.todayEnergyObject) {
				this.updateCalcedEnergy();
				this.calcAccuracy();
			}
			// The state was changed
			// this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			// this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires 'common.messagebox' property to be set to true in io-package.json
	//  */
	// private onMessage(obj: ioBroker.Message): void {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

	private async updateData(): Promise<void> {
		const logPrefix = '[updateData]:';

		let nextUpdateTime = undefined;

		try {
			if (this.config.project && this.config.accessToken && this.config.solarprognoseItem && this.config.solarprognoseId) {
				const url = `${this.apiEndpoint}?access-token=${this.config.accessToken}&project=${this.config.project}&item=${this.config.solarprognoseItem}&id=${this.config.solarprognoseId}&algorithm=${this.config.solarprognoseAlgorithm}&type=hourly&_format=json`;
				const response = await this.downloadData(url);



				this.log.silly(JSON.stringify(response));

				if (response) {
					if (response.status === 0) {
						await this.createOrUpdateState(this.namespace, myTypes.stateDefinition['statusResponse'], response.status, 'statusResponse', true);
						this.solarData = response.data;

						await this.processData();
						await this.updateCalcedEnergy();
						await this.calcAccuracy();

						if (this.updateSchedule) this.updateSchedule.cancel()
						nextUpdateTime = this.getNextUpdateTime(response.preferredNextApiRequestAt);

						await this.createOrUpdateState(this.namespace, myTypes.stateDefinition['lastUpdate'], moment().format(`ddd ${this.dateFormat} HH:mm:ss`), 'lastUpdate');

						this.log.info(`${logPrefix} data successfully updated, next update: ${nextUpdateTime.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);

					} else {
						//@ts-ignore
						this.log.error(`${logPrefix} data received with error code: ${response.status} - ${myTypes.stateDefinition.statusResponse.common.states[response.status]}`);
					}
				} else {
					this.log.error(`${logPrefix} no data received!`);
				}
			} else {
				this.log.error(`${logPrefix} settings missing. Please check your adapter configuration!`);
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		if (nextUpdateTime) {
			this.updateSchedule = schedule.scheduleJob(nextUpdateTime.toDate(), async () => {
				this.updateData();
			});
		} else {
			this.log.warn(`${logPrefix} no next update time receive, try again in 1 hour`);
			this.updateSchedule = schedule.scheduleJob(moment().add(1, 'hours').toDate(), async () => {
				this.updateData();
			});
		}
	}

	private async processData(): Promise<void> {
		const logPrefix = '[processData]:';

		try {
			if (this.solarData) {
				const jsonResult: Array<myTypes.myJsonStructure> = [];

				for (let i = 0; i <= Object.keys(this.solarData).length - 1; i++) {
					const timestamp = parseInt(Object.keys(this.solarData)[i]);
					const momentTs = moment(timestamp * 1000);
					const arr = Object.values(this.solarData)[i];

					if (!momentTs.isBefore(moment().startOf('day'))) {
						// filter out past data
						const diffDays = momentTs.diff(moment().startOf('day'), 'days');
						const channelDayId = `${myHelper.zeroPad(diffDays, 2)}`;
						const channelHourId = `${myHelper.zeroPad(momentTs.hours(), 2)}h`

						if (diffDays <= this.config.dailyMax) {
							jsonResult.push({
								human: momentTs.format(`ddd ${this.dateFormat} HH:mm`),
								timestamp: timestamp,
								val: arr[0],
								total: arr[1]
							});
						}

						if (this.config.dailyEnabled && diffDays <= this.config.dailyMax) {
							if (!Object.keys(this.solarData)[i + 1] || (Object.keys(this.solarData)[i + 1] && !momentTs.isSame(moment(parseInt(Object.keys(this.solarData)[i + 1]) * 1000), 'day'))) {
								await this.createOrUpdateChannel(channelDayId, diffDays === 0 ? this.getTranslation('today') : diffDays === 1 ? this.getTranslation('tomorrow') : this.getTranslation('inXDays').replace('{0}', diffDays.toString()));

								await this.createOrUpdateState(channelDayId, myTypes.stateDefinition['energy'], arr[1], 'energy');
							}
						} else {
							if (this.config.dailyEnabled && diffDays <= this.config.dailyMax) {
								if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition['energy'].id}`)) {
									await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition['energy'].id}`);
									this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition['energy'].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
								}
								if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition['energy_now'].id}`)) {
									await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition['energy_now'].id}`);
									this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition['energy_now'].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
								}
								if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition['energy_from_now'].id}`)) {
									await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition['energy_from_now'].id}`);
									this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition['energy_from_now'].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
								}
							} else {
								if (await this.objectExists(`${channelDayId}`)) {
									await this.delObjectAsync(`${channelDayId}`, { recursive: true });
									this.log.info(`${logPrefix} deleting channel '${channelDayId}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
								}
							}
						}

						if (this.config.hourlyEnabled && diffDays <= this.config.dailyMax) {
							await this.createOrUpdateChannel(`${channelDayId}.${channelHourId}`, this.getTranslation('xOClock').replace('{0}', momentTs.hour().toString()));

							await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition['date'], momentTs.format(`ddd ${this.dateFormat} HH:mm`), 'date');
							await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition['power'], arr[0], 'power');
							await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition['energy'], arr[1], 'energy');
						} else {
							if (await this.objectExists(`${channelDayId}.${channelHourId}`)) {
								await this.delObjectAsync(`${channelDayId}.${channelHourId}`, { recursive: true });
								this.log.info(`${logPrefix} deleting channel '${channelDayId}.${channelHourId}' (config.hourlyEnabled: ${this.config.hourlyEnabled})`);
							}
						}
					}
				}

				if (this.config.jsonTableEnabled) {
					await this.createOrUpdateState(this.namespace, myTypes.stateDefinition['jsonTable'], JSON.stringify(jsonResult), 'jsonTable');
				} else {
					if (myTypes.stateDefinition['jsonTable'].id && await this.objectExists(myTypes.stateDefinition['jsonTable'].id)) {
						await this.delObjectAsync(myTypes.stateDefinition['jsonTable'].id);
						this.log.info(`${logPrefix} deleting state '${myTypes.stateDefinition['jsonTable'].id}' (config.jsonTableEnabled: ${this.config.jsonTableEnabled})`);
					}
				}

			} else {
				this.log.error(`${logPrefix} received data has no forecast data!`);
			}

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateCalcedEnergy(): Promise<void> {
		const logPrefix = '[updateCalcedEnergy]:';

		try {
			if (this.config.dailyEnabled) {
				const nowTs = moment().startOf('hour').unix();
				const nextHourTs = moment().startOf('hour').add(1, 'hour').unix();

				const idEnergy = `00.${myTypes.stateDefinition['energy'].id}`

				if (await this.objectExists(idEnergy)) {
					const energyTotalToday = await this.getStateAsync(idEnergy);

					if (this.solarData && this.solarData[nowTs]) {
						if (energyTotalToday && (energyTotalToday.val || energyTotalToday.val === 0)) {
							let energyNow = this.solarData[nowTs][1];

							if (this.config.dailyInterpolation && this.solarData[nextHourTs]) {
								energyNow = Math.round((this.solarData[nowTs][1] + (this.solarData[nextHourTs][1] - this.solarData[nowTs][1]) / 60 * moment().minutes()) * 1000) / 1000;
								this.log.debug(`${logPrefix} update energy_now with interpolation: ${energyNow} kWh (energy now: ${this.solarData[nowTs][1]}, energy next: ${this.solarData[nextHourTs][1]}, minutes: ${moment().minutes()}))`)
							} else {
								this.log.debug(`${logPrefix} update energy_now: ${energyNow} kWh (energy now: ${this.solarData[nowTs][1]})`);
							}

							await this.createOrUpdateState('00', myTypes.stateDefinition['energy_now'], energyNow, 'energy_now');
							await this.createOrUpdateState('00', myTypes.stateDefinition['energy_from_now'], Math.round(((energyTotalToday.val as number) - energyNow) * 1000) / 1000, 'energy_from_now');
						}
					} else {
						await this.createOrUpdateState('00', myTypes.stateDefinition['energy_now'], (energyTotalToday?.val as number), 'energy_now');
						await this.createOrUpdateState('00', myTypes.stateDefinition['energy_from_now'], 0, 'energy_from_now');
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async calcAccuracy(): Promise<void> {
		const logPrefix = '[calcAccuracy]:';

		try {
			if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && (await this.foreignObjectExists(this.config.todayEnergyObject))) {
				if (moment().hour() === 0) {
					// reset at day change
					await this.createOrUpdateState(`${this.namespace}.00`, myTypes.stateDefinition['accuracy'], 0, 'accuracy');
					this.log.debug(`${logPrefix} reset accuracy because of new day started`);
				} else {
					const idEnergy = `00.${myTypes.stateDefinition['energy_now'].id}`

					if ((await this.foreignObjectExists(this.config.todayEnergyObject)) && (await this.objectExists(idEnergy))) {

						const forecastEnergy = await this.getStateAsync(idEnergy);
						const todayEnergy = await this.getForeignStateAsync(this.config.todayEnergyObject);

						if (forecastEnergy && forecastEnergy.val && todayEnergy && (todayEnergy.val || todayEnergy.val === 0)) {
							const res = Math.round((todayEnergy.val as number) / (forecastEnergy.val as number) * 100) / 100;

							this.log.debug(`${logPrefix} new accuracy: ${res} (energy now: ${forecastEnergy.val}, energyToday: ${todayEnergy.val}) `);

							await this.createOrUpdateState(`${this.namespace}.00`, myTypes.stateDefinition['accuracy'], res, 'accuracy');
						}
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async downloadData(url: string): Promise<myTypes.dataStructure | undefined> {
		const logPrefix = '[downloadData]:';

		try {
			if (!this.testMode) {
				const response: any = await fetch(url);

				if (response.status === 200) {
					this.log.debug(`${logPrefix} data successfully received`);

					return await response.json();
				} else {
					this.log.error(`${logPrefix} status code: ${response.status}`);
				}
			} else {
				this.log.warn(`${logPrefix} Test mode is active!`);

				const { default: data } = await import('../test/testData.json', { assert: { type: 'json' } });
				return data;
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		return undefined;
	}

	private async createOrUpdateState(idChannel: string, stateDef: myTypes.tStateDefinition, val: string | number, key: string, forceUpdate: boolean = false): Promise<boolean> {
		const logPrefix = '[createOrUpdateState]:';

		try {
			const id = `${idChannel}.${stateDef.id}`

			if (stateDef.common) {
				stateDef.common.name = this.getTranslation(key);

				if (stateDef.common.unit && Object.prototype.hasOwnProperty.call(this.config, stateDef.common.unit)) {
					//@ts-ignore
					stateDef.common.unit = this.getTranslation(this.config[stateDef.common.unit]) || stateDef.common.unit
				}

				if (!await this.objectExists(id)) {
					this.log.debug(`${logPrefix} creating state '${id}'`);

					const obj = {
						type: 'state',
						common: stateDef.common,
						native: {}
					};

					//@ts-ignore
					await this.setObjectAsync(id, obj);
				} else {
					// update State if needed
					const obj = await this.getObjectAsync(id);

					if (obj && obj.common) {
						if (!myHelper.isStateCommonEqual(obj.common as ioBroker.StateCommon, stateDef.common)) {
							await this.extendObject(id, { common: stateDef.common });
							this.log.info(`${logPrefix} updated common properties of state '${id}'`);
						}
					}
				}

				if (forceUpdate) {
					await this.setState(id, val, true);
					this.log.silly(`${logPrefix} value of state '${id}' updated to ${val} (force: ${forceUpdate})`);

					return true;
				} else {
					let changedObj: any = undefined;

					changedObj = await this.setStateChangedAsync(id, val, true);

					if (changedObj && Object.prototype.hasOwnProperty.call(changedObj, 'notChanged') && !changedObj.notChanged) {
						this.log.silly(`${logPrefix} value of state '${id}' changed to ${val}`);
						return !changedObj.notChanged
					}
				}
			}
		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}

		return false;
	}

	private async createOrUpdateChannel(id: string, name: string): Promise<void> {
		const logPrefix = '[createOrUpdateChannel]:';

		try {
			const common = {
				name: name,
				// icon: myDeviceImages[nvr.type] ? myDeviceImages[nvr.type] : null
			};

			if (!await this.objectExists(id)) {
				this.log.debug(`${logPrefix} creating channel '${id}'`);
				await this.setObjectAsync(id, {
					type: 'channel',
					common: common,
					native: {}
				});
			} else {
				const obj = await this.getObjectAsync(id);

				if (obj && obj.common) {
					if (!myHelper.isChannelCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
						await this.extendObject(id, { common: common });
						this.log.info(`${logPrefix} channel updated '${id}'`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private getNextUpdateTime(preferredNextApiRequestAt: myTypes.preferredNextApiRequestAt | undefined): moment.Moment {
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

	private async loadTranslation(): Promise<void> {
		const logPrefix = '[loadTranslation]:';

		try {
			moment.locale(this.language || 'en');

			const fileName = `../admin/i18n/${this.language || 'en'}/translations.json`

			this.myTranslation = (await import(fileName, { assert: { type: 'json' } })).default;

			this.log.debug(`${logPrefix} translation data loaded from '${fileName}'`);

		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}
	}

	private getTranslation(str: string): string {
		const logPrefix = '[getTranslation]:';

		try {
			if (this.myTranslation && this.myTranslation[str]) {
				return this.myTranslation[str];
			} else {
				this.log.warn(`${logPrefix} no translation for key '${str}' exists!`);
			}
		} catch (err: any) {
			console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}

		return str;
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Solarprognose(options);
} else {
	// otherwise start the instance directly
	(() => new Solarprognose())();
}
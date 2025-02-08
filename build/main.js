"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_moment = __toESM(require("moment"));
var schedule = __toESM(require("node-schedule"));
var myTypes = __toESM(require("./lib/myTypes"));
var myHelper = __toESM(require("./lib/helper"));
class Solarprognose extends utils.Adapter {
  testMode = false;
  apiEndpoint = "https://www.solarprognose.de/web/solarprediction/api/v1";
  updateSchedule = void 0;
  hourlySchedule = void 0;
  interpolationSchedule = void 0;
  solarData = void 0;
  myTranslation;
  constructor(options = {}) {
    super({
      ...options,
      name: "solarprognose",
      useFormatDate: true
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    const logPrefix = "[onReady]:";
    try {
      await this.loadTranslation();
      await this.updateData();
      if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && await this.foreignObjectExists(this.config.todayEnergyObject)) {
        await this.subscribeForeignStatesAsync(this.config.todayEnergyObject);
      }
      this.hourlySchedule = schedule.scheduleJob("0 * * * *", async () => {
        this.updateCalcedEnergy();
        this.calcAccuracy();
      });
      if (this.config.dailyInterpolation) {
        this.interpolationSchedule = schedule.scheduleJob("*/5 * * * *", async () => {
          this.updateCalcedEnergy();
          this.calcAccuracy();
        });
      }
    } catch (error) {
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
    } catch (e) {
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
  async onStateChange(id, state) {
    if (state) {
      if (id = this.config.todayEnergyObject) {
        this.updateCalcedEnergy();
        this.calcAccuracy();
      }
    } else {
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
  async updateData() {
    const logPrefix = "[updateData]:";
    let nextUpdateTime = void 0;
    try {
      if (this.config.project && this.config.accessToken && this.config.solarprognoseItem && this.config.solarprognoseId) {
        const url = `${this.apiEndpoint}?access-token=${this.config.accessToken}&project=${this.config.project}&item=${this.config.solarprognoseItem}&id=${this.config.solarprognoseId}&algorithm=${this.config.solarprognoseAlgorithm}&type=hourly&_format=json`;
        const response = await this.downloadData(url);
        this.log.silly(JSON.stringify(response));
        if (response) {
          if (response.status === 0) {
            await this.createOrUpdateState(this.namespace, myTypes.stateDefinition["statusResponse"], response.status, "statusResponse", true);
            this.solarData = response.data;
            await this.processData();
            await this.updateCalcedEnergy();
            await this.calcAccuracy();
            if (this.updateSchedule)
              this.updateSchedule.cancel();
            nextUpdateTime = this.getNextUpdateTime(response.preferredNextApiRequestAt);
            await this.createOrUpdateState(this.namespace, myTypes.stateDefinition["lastUpdate"], (0, import_moment.default)().format(`ddd ${this.dateFormat} HH:mm:ss`), "lastUpdate");
            this.log.info(`${logPrefix} data successfully updated, next update: ${nextUpdateTime.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
          } else {
            this.log.error(`${logPrefix} data received with error code: ${response.status} - ${myTypes.stateDefinition.statusResponse.common.states[response.status]}`);
          }
        } else {
          this.log.error(`${logPrefix} no data received!`);
        }
      } else {
        this.log.error(`${logPrefix} settings missing. Please check your adapter configuration!`);
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    if (nextUpdateTime) {
      this.updateSchedule = schedule.scheduleJob(nextUpdateTime.toDate(), async () => {
        this.updateData();
      });
    } else {
      this.log.warn(`${logPrefix} no next update time receive, try again in 1 hour`);
      this.updateSchedule = schedule.scheduleJob((0, import_moment.default)().add(1, "hours").toDate(), async () => {
        this.updateData();
      });
    }
  }
  async processData() {
    const logPrefix = "[processData]:";
    try {
      if (this.solarData) {
        const jsonResult = [];
        for (let i = 0; i <= Object.keys(this.solarData).length - 1; i++) {
          const timestamp = parseInt(Object.keys(this.solarData)[i]);
          const momentTs = (0, import_moment.default)(timestamp * 1e3);
          const arr = Object.values(this.solarData)[i];
          if (!momentTs.isBefore((0, import_moment.default)().startOf("day"))) {
            const diffDays = momentTs.diff((0, import_moment.default)().startOf("day"), "days");
            const channelDayId = `${myHelper.zeroPad(diffDays, 2)}`;
            const channelHourId = `${myHelper.zeroPad(momentTs.hours(), 2)}h`;
            if (diffDays <= this.config.dailyMax) {
              jsonResult.push({
                human: momentTs.format(`ddd ${this.dateFormat} HH:mm`),
                timestamp,
                val: arr[0],
                total: arr[1]
              });
            }
            if (this.config.dailyEnabled && diffDays <= this.config.dailyMax) {
              if (!Object.keys(this.solarData)[i + 1] || Object.keys(this.solarData)[i + 1] && !momentTs.isSame((0, import_moment.default)(parseInt(Object.keys(this.solarData)[i + 1]) * 1e3), "day")) {
                await this.createOrUpdateChannel(channelDayId, diffDays === 0 ? this.getTranslation("today") : diffDays === 1 ? this.getTranslation("tomorrow") : this.getTranslation("inXDays").replace("{0}", diffDays.toString()));
                await this.createOrUpdateState(channelDayId, myTypes.stateDefinition["energy"], arr[1], "energy");
              }
            } else {
              if (this.config.dailyEnabled && diffDays <= this.config.dailyMax) {
                if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition["energy"].id}`)) {
                  await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition["energy"].id}`);
                  this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition["energy"].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
                }
                if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition["energy_now"].id}`)) {
                  await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition["energy_now"].id}`);
                  this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition["energy_now"].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
                }
                if (await this.objectExists(`${channelDayId}.${myTypes.stateDefinition["energy_from_now"].id}`)) {
                  await this.delObjectAsync(`${channelDayId}.${myTypes.stateDefinition["energy_from_now"].id}`);
                  this.log.info(`${logPrefix} deleting state '${channelDayId}.${myTypes.stateDefinition["energy_from_now"].id}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
                }
              } else {
                if (await this.objectExists(`${channelDayId}`)) {
                  await this.delObjectAsync(`${channelDayId}`, { recursive: true });
                  this.log.info(`${logPrefix} deleting channel '${channelDayId}' (config.dailyEnabled: ${this.config.hourlyEnabled}, config.hourlyEnabled: ${this.config.hourlyEnabled})`);
                }
              }
            }
            if (this.config.hourlyEnabled && diffDays <= this.config.dailyMax) {
              await this.createOrUpdateChannel(`${channelDayId}.${channelHourId}`, this.getTranslation("xOClock").replace("{0}", momentTs.hour().toString()));
              await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition["date"], momentTs.format(`ddd ${this.dateFormat} HH:mm`), "date");
              await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition["power"], arr[0], "power");
              await this.createOrUpdateState(`${channelDayId}.${channelHourId}`, myTypes.stateDefinition["energy"], arr[1], "energy");
            } else {
              if (await this.objectExists(`${channelDayId}.${channelHourId}`)) {
                await this.delObjectAsync(`${channelDayId}.${channelHourId}`, { recursive: true });
                this.log.info(`${logPrefix} deleting channel '${channelDayId}.${channelHourId}' (config.hourlyEnabled: ${this.config.hourlyEnabled})`);
              }
            }
          }
        }
        if (this.config.jsonTableEnabled) {
          await this.createOrUpdateState(this.namespace, myTypes.stateDefinition["jsonTable"], JSON.stringify(jsonResult), "jsonTable");
        } else {
          if (myTypes.stateDefinition["jsonTable"].id && await this.objectExists(myTypes.stateDefinition["jsonTable"].id)) {
            await this.delObjectAsync(myTypes.stateDefinition["jsonTable"].id);
            this.log.info(`${logPrefix} deleting state '${myTypes.stateDefinition["jsonTable"].id}' (config.jsonTableEnabled: ${this.config.jsonTableEnabled})`);
          }
        }
      } else {
        this.log.error(`${logPrefix} received data has no forecast data!`);
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
  }
  async updateCalcedEnergy() {
    const logPrefix = "[updateCalcedEnergy]:";
    try {
      if (this.config.dailyEnabled) {
        const nowTs = (0, import_moment.default)().startOf("hour").unix();
        const nextHourTs = (0, import_moment.default)().startOf("hour").add(1, "hour").unix();
        const idEnergy = `00.${myTypes.stateDefinition["energy"].id}`;
        if (await this.objectExists(idEnergy)) {
          const energyTotalToday = await this.getStateAsync(idEnergy);
          if (this.solarData && this.solarData[nowTs]) {
            if (energyTotalToday && (energyTotalToday.val || energyTotalToday.val === 0)) {
              let energyNow = this.solarData[nowTs][1];
              if (this.config.dailyInterpolation && this.solarData[nextHourTs]) {
                energyNow = Math.round((this.solarData[nowTs][1] + (this.solarData[nextHourTs][1] - this.solarData[nowTs][1]) / 60 * (0, import_moment.default)().minutes()) * 1e3) / 1e3;
                this.log.debug(`${logPrefix} update energy_now with interpolation: ${energyNow} kWh (energy now: ${this.solarData[nowTs][1]}, energy next: ${this.solarData[nextHourTs][1]}, minutes: ${(0, import_moment.default)().minutes()}))`);
              } else {
                this.log.debug(`${logPrefix} update energy_now: ${energyNow} kWh (energy now: ${this.solarData[nowTs][1]})`);
              }
              await this.createOrUpdateState("00", myTypes.stateDefinition["energy_now"], energyNow, "energy_now");
              await this.createOrUpdateState("00", myTypes.stateDefinition["energy_from_now"], Math.round((energyTotalToday.val - energyNow) * 1e3) / 1e3, "energy_from_now");
            }
          } else {
            await this.createOrUpdateState("00", myTypes.stateDefinition["energy_now"], energyTotalToday == null ? void 0 : energyTotalToday.val, "energy_now");
            await this.createOrUpdateState("00", myTypes.stateDefinition["energy_from_now"], 0, "energy_from_now");
          }
        }
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
  }
  async calcAccuracy() {
    const logPrefix = "[calcAccuracy]:";
    try {
      if (this.config.dailyEnabled && this.config.accuracyEnabled && this.config.todayEnergyObject && await this.foreignObjectExists(this.config.todayEnergyObject)) {
        if ((0, import_moment.default)().hour() === 0) {
          await this.createOrUpdateState(`${this.namespace}.00`, myTypes.stateDefinition["accuracy"], 0, "accuracy");
          this.log.debug(`${logPrefix} reset accuracy because of new day started`);
        } else {
          const idEnergy = `00.${myTypes.stateDefinition["energy_now"].id}`;
          if (await this.foreignObjectExists(this.config.todayEnergyObject) && await this.objectExists(idEnergy)) {
            const forecastEnergy = await this.getStateAsync(idEnergy);
            const todayEnergy = await this.getForeignStateAsync(this.config.todayEnergyObject);
            if (forecastEnergy && forecastEnergy.val && todayEnergy && (todayEnergy.val || todayEnergy.val === 0)) {
              const res = Math.round(todayEnergy.val / forecastEnergy.val * 100) / 100;
              this.log.debug(`${logPrefix} new accuracy: ${res} (energy now: ${forecastEnergy.val}, energyToday: ${todayEnergy.val}) `);
              await this.createOrUpdateState(`${this.namespace}.00`, myTypes.stateDefinition["accuracy"], res, "accuracy");
            }
          }
        }
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
  }
  async downloadData(url) {
    const logPrefix = "[downloadData]:";
    try {
      if (!this.testMode) {
        const response = await fetch(url);
        if (response.status === 200) {
          this.log.debug(`${logPrefix} data successfully received`);
          return await response.json();
        } else {
          this.log.error(`${logPrefix} status code: ${response.status}`);
        }
      } else {
        this.log.warn(`${logPrefix} Test mode is active!`);
        const { default: data } = await Promise.resolve().then(() => __toESM(require("../test/testData.json")));
        return data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  async createOrUpdateState(idChannel, stateDef, val, key, forceUpdate = false) {
    const logPrefix = "[createOrUpdateState]:";
    try {
      const id = `${idChannel}.${stateDef.id}`;
      if (stateDef.common) {
        stateDef.common.name = this.getTranslation(key);
        if (stateDef.common.unit && Object.prototype.hasOwnProperty.call(this.config, stateDef.common.unit)) {
          stateDef.common.unit = this.getTranslation(this.config[stateDef.common.unit]) || stateDef.common.unit;
        }
        if (!await this.objectExists(id)) {
          this.log.debug(`${logPrefix} creating state '${id}'`);
          const obj = {
            type: "state",
            common: stateDef.common,
            native: {}
          };
          await this.setObjectAsync(id, obj);
        } else {
          const obj = await this.getObjectAsync(id);
          if (obj && obj.common) {
            if (!myHelper.isStateCommonEqual(obj.common, stateDef.common)) {
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
          let changedObj = void 0;
          changedObj = await this.setStateChangedAsync(id, val, true);
          if (changedObj && Object.prototype.hasOwnProperty.call(changedObj, "notChanged") && !changedObj.notChanged) {
            this.log.silly(`${logPrefix} value of state '${id}' changed to ${val}`);
            return !changedObj.notChanged;
          }
        }
      }
    } catch (err) {
      console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
    }
    return false;
  }
  async createOrUpdateChannel(id, name) {
    const logPrefix = "[createOrUpdateChannel]:";
    try {
      const common = {
        name
        // icon: myDeviceImages[nvr.type] ? myDeviceImages[nvr.type] : null
      };
      if (!await this.objectExists(id)) {
        this.log.debug(`${logPrefix} creating channel '${id}'`);
        await this.setObjectAsync(id, {
          type: "channel",
          common,
          native: {}
        });
      } else {
        const obj = await this.getObjectAsync(id);
        if (obj && obj.common) {
          if (!myHelper.isChannelCommonEqual(obj.common, common)) {
            await this.extendObject(id, { common });
            this.log.info(`${logPrefix} channel updated '${id}'`);
          }
        }
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
  }
  getNextUpdateTime(preferredNextApiRequestAt) {
    const logPrefix = "[getNextUpdateTime]:";
    let nextUpdate = (0, import_moment.default)().add(1, "hours");
    try {
      if (preferredNextApiRequestAt && preferredNextApiRequestAt.epochTimeUtc) {
        const nextApiRequestLog = (0, import_moment.default)(preferredNextApiRequestAt.epochTimeUtc * 1e3).format(`ddd ${this.dateFormat} HH:mm:ss`);
        if (!(0, import_moment.default)().isBefore((0, import_moment.default)(preferredNextApiRequestAt.epochTimeUtc * 1e3))) {
          this.log.debug(`${logPrefix} preferredNextApiRequestAt: '${nextApiRequestLog}' is in the past! Next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
        } else if ((0, import_moment.default)(preferredNextApiRequestAt.epochTimeUtc * 1e3).diff((0, import_moment.default)()) / (1e3 * 60 * 60) >= 1.1) {
          this.log.debug(`${logPrefix} preferredNextApiRequestAt: '${nextApiRequestLog}' is more than one hour in the future! Next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
        } else {
          nextUpdate = (0, import_moment.default)(preferredNextApiRequestAt.epochTimeUtc * 1e3);
          this.log.debug(`${logPrefix} next update: ${(0, import_moment.default)(preferredNextApiRequestAt.epochTimeUtc * 1e3).format(`ddd ${this.dateFormat} HH:mm:ss`)} by 'preferredNextApiRequestAt'`);
        }
      } else {
        this.log.debug(`${logPrefix} no 'preferredNextApiRequestAt' exist, next update: ${nextUpdate.format(`ddd ${this.dateFormat} HH:mm:ss`)}`);
      }
    } catch (err) {
      console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
    }
    return nextUpdate;
  }
  async loadTranslation() {
    const logPrefix = "[loadTranslation]:";
    try {
      import_moment.default.locale(this.language || "en");
      const fileName = `../admin/i18n/${this.language || "en"}/translations.json`;
      this.myTranslation = (await Promise.resolve().then(() => __toESM(require(fileName)))).default;
      this.log.debug(`${logPrefix} translation data loaded from '${fileName}'`);
    } catch (err) {
      console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
    }
  }
  getTranslation(str) {
    const logPrefix = "[getTranslation]:";
    try {
      if (this.myTranslation && this.myTranslation[str]) {
        return this.myTranslation[str];
      } else {
        this.log.warn(`${logPrefix} no translation for key '${str}' exists!`);
      }
    } catch (err) {
      console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
    }
    return str;
  }
}
if (require.main !== module) {
  module.exports = (options) => new Solarprognose(options);
} else {
  (() => new Solarprognose())();
}
//# sourceMappingURL=main.js.map

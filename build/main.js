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
class Solarprognose extends utils.Adapter {
  testMode = false;
  apiEndpoint = "https://www.solarprognose.de/web/solarprediction/api/v1";
  updateSchedule = void 0;
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
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
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
    try {
      if (this.config.project && this.config.accessToken && this.config.solarprognoseItem && this.config.solarprognoseId) {
        const url = `${this.apiEndpoint}?access-token=${this.config.accessToken}&project=${this.config.project}&item=${this.config.solarprognoseItem}&id=${this.config.solarprognoseId}&type=hourly&_format=json`;
        const response = await this.downloadData(url);
        this.log.silly(JSON.stringify(response));
        if (response) {
          if (response.status === 0) {
            await this.createOrUpdateState(this.namespace, myTypes.stateDefinition["statusResponse"], response.status, "statusResponse", true);
            await this.processData(response.data);
            if (this.updateSchedule)
              this.updateSchedule.cancel();
            const nextUpdateTime = this.getNextUpdateTime(response.preferredNextApiRequestAt);
            this.updateSchedule = schedule.scheduleJob(nextUpdateTime.toDate(), async () => {
              this.updateData();
            });
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
  }
  async processData(data) {
    const logPrefix = "[processData]:";
    try {
      if (data) {
        const jsonResult = [];
        for (const [timestamp, arr] of Object.entries(data)) {
          jsonResult.push({
            human: (0, import_moment.default)(parseInt(timestamp) * 1e3).format(`ddd ${this.dateFormat} HH:mm`),
            timestamp: parseInt(timestamp),
            val: arr[0],
            total: arr[1]
          });
          await this.createOrUpdateState(this.namespace, myTypes.stateDefinition["jsonTable"], JSON.stringify(jsonResult), "jsonTable");
        }
      } else {
        this.log.error(`${logPrefix} received data has no forecast data!`);
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
          if (JSON.stringify(obj.common) !== JSON.stringify(stateDef.common)) {
            await this.extendObject(id, { common: stateDef.common });
            this.log.debug(`${logPrefix} updated common properties of state '${id}'`);
          }
        }
      }
      if (forceUpdate) {
        await this.setState(id, val, true);
        this.log.silly(`${logPrefix} value of state '${id}' updated (force: ${forceUpdate})`);
        return true;
      } else {
        let changedObj = void 0;
        changedObj = await this.setStateChangedAsync(id, val, true);
        if (changedObj && Object.prototype.hasOwnProperty.call(changedObj, "notChanged") && !changedObj.notChanged) {
          this.log.silly(`${logPrefix} value of state '${id}' changed`);
          return !changedObj.notChanged;
        }
      }
    } catch (err) {
      console.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
    }
    return false;
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

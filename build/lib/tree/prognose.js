import * as myHelper from '../helper.js';
import moment from "moment";
export var prognose;
(function (prognose) {
    let keys = undefined;
    prognose.idChannel = 'forecast';
    function get() {
        return {
            json: {
                iobType: 'string',
                role: 'json',
                name: 'json table',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return adapter.config.jsonTableEnabled;
                },
                readVal(val, adapter, device, channel, id) {
                    return JSON.stringify(val);
                },
            },
            lastUpdate: {
                iobType: 'number',
                name: "last update of the data",
            },
            status: {
                iobType: 'number',
                name: 'api status response',
                states: {
                    0: 'OK',
                    '-2': 'INVALID ACCESS TOKEN',
                    '-3': 'MISSING PARAMETER ACCESS TOKEN',
                    '-4': 'EMPTY PARAMETER ACCESS TOKEN',
                    '-5': 'INVALID TYPE',
                    '-6': 'MISSING TYPE',
                    '-7': 'INVALID ID',
                    '-8': 'ACCESS DENIED',
                    '-9': 'INVALID ITEM',
                    '-10': 'INVALID TOKEN',
                    '-11': 'NO SOLAR DATA AVAILABLE',
                    '-12': 'NO DATA',
                    '-13': 'INTERNAL ERROR',
                    '-14': 'UNKNOWN ERROR',
                    '-15': 'INVALID START DAY',
                    '-16': 'INVALID END DAY',
                    '-17': 'INVALID DAY',
                    '-18': 'INVALID WEATHER SERVICE ID',
                    '-19': 'DAILY QUOTA EXCEEDED',
                    '-20': 'INVALID OR MISSING ELEMENT ITEM',
                    '-21': 'NO PARAMETER',
                    '-22': 'INVALID PERIOD',
                    '-23': 'INVALID START EPOCH TIME',
                    '-24': 'INVALID END EPOCH TIME',
                    '-25': 'ACCESS DENIED TO ITEM DUE TO LIMIT',
                    '-26': 'NO CLEARSKY VALUES',
                    '-27': 'MISSING INPUT ID AND TOKEN',
                    '-28': 'INVALID ALGORITHM',
                    '-29': 'FAILED TO LOAD WEATHER LOCATION ITEM'
                }
            },
            forecast: {
                arrayChannelIdZeroPad: 2,
                arrayChannelNameFromProperty(objDevice, objChannel, i, adapter) {
                    if (i === 0) {
                        return 'today';
                    }
                    else if (i === 1) {
                        return 'tomorrow';
                    }
                    else {
                        return adapter.myIob.utils.I18n.getTranslatedObject('in %s days', i);
                    }
                },
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return adapter.config.dailyEnabled || adapter.config.hourlyEnabled;
                },
                array: {
                    energy: {
                        iobType: 'number',
                        unit: 'kWh',
                        conditionToCreateState(objDevice, objChannel, adapter) {
                            // only wired and wireless clients
                            return adapter.config.dailyEnabled;
                        },
                        readVal(val, adapter, device, channel, id) {
                            return Math.round(val * 1000) / 1000;
                        },
                    },
                    energy_now: {
                        iobType: 'number',
                        unit: 'kWh',
                        subscribeMe: true,
                        conditionToCreateState(objDevice, objChannel, adapter) {
                            // only wired and wireless clients
                            return adapter.config.dailyEnabled;
                        },
                        readVal(val, adapter, device, channel, id) {
                            return Math.round(val * 1000) / 1000;
                        },
                    },
                    energy_from_now: {
                        iobType: 'number',
                        unit: 'kWh',
                        conditionToCreateState(objDevice, objChannel, adapter) {
                            // only wired and wireless clients
                            return adapter.config.dailyEnabled;
                        },
                        readVal(val, adapter, device, channel, id) {
                            return Math.round(val * 1000) / 1000;
                        },
                    },
                    accuracy: {
                        iobType: 'number',
                        conditionToCreateState(objDevice, objChannel, adapter) {
                            // only wired and wireless clients
                            return adapter.config.accuracyEnabled;
                        },
                        unit: '%',
                    },
                    hourly: {
                        arrayChannelIdFromProperty(objDevice, objChannel, i, adapter) {
                            return `${myHelper.zeroPad(moment(objChannel.timestamp).hour(), 2)}h`;
                        },
                        arrayChannelNameFromProperty(objDevice, objChannel, i, adapter) {
                            return adapter.myIob.utils.I18n.getTranslatedObject('%s o\'clock', moment(objChannel.timestamp).hour());
                        },
                        conditionToCreateState(objDevice, objChannel, adapter) {
                            // only wired and wireless clients
                            return adapter.config.hourlyEnabled;
                        },
                        array: {
                            date: {
                                iobType: 'string',
                                valFromProperty: 'timestamp',
                                readVal(val, adapter, device, channel, id) {
                                    return moment(val).format(`ddd ${adapter.dateFormat} HH:mm:ss`);
                                },
                            },
                            energy: {
                                iobType: 'number',
                                unit: 'kWh',
                                readVal(val, adapter, device, channel, id) {
                                    return Math.round(val * 1000) / 1000;
                                },
                            },
                            power: {
                                iobType: 'number',
                                unit: 'kW',
                                readVal(val, adapter, device, channel, id) {
                                    return Math.round(val * 1000) / 1000;
                                },
                            }
                        }
                    }
                },
            }
        };
    }
    prognose.get = get;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
            // manual add keys here:
            keys.push(...['fingerprint.computed_engine', 'fingerprint.dev_id_override', 'fingerprint.dev_id', 'fingerprint.has_override']);
        }
        return keys;
    }
    prognose.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    prognose.getStateIDs = getStateIDs;
})(prognose || (prognose = {}));

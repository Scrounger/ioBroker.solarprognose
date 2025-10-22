import * as myHelper from '../helper.js';
import { stateDefinition } from "../myTypes.js";
import moment from "moment";
export var prognose;
(function (prognose) {
    let keys = undefined;
    prognose.idChannel = 'forecast.current';
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
                states: stateDefinition.statusResponse.common.states
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
                            },
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

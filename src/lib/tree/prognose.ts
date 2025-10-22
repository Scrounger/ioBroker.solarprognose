import { myTreeDefinition } from "../myIob.js";
import * as myHelper from '../helper.js';
import { Prognose, PrognoseDaily, PrognoseHourly, stateDefinition } from "../myTypes.js";
import moment from "moment";

export namespace prognose {
    let keys: string[] = undefined;

    export const idChannel = 'forecast.current';

    export function get(): { [key: string]: myTreeDefinition } {
        return {
            json: {
                iobType: 'string',
                role: 'json',
                name: 'json table',
                conditionToCreateState(objDevice: Prognose, objChannel: Prognose, adapter: ioBroker.myAdapter): boolean {
                    // only wired and wireless clients
                    return adapter.config.jsonTableEnabled;
                },
                readVal(val: PrognoseHourly[], adapter: ioBroker.myAdapter, device: Prognose, channel: Prognose, id: string) {
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
                arrayChannelNameFromProperty(objDevice: Prognose, objChannel: PrognoseDaily, i: number, adapter: ioBroker.myAdapter): string | ioBroker.Translated {
                    if (i === 0) {
                        return 'today'
                    } else if (i === 1) {
                        return 'tomorrow'
                    } else {
                        return adapter.myIob.utils.I18n.getTranslatedObject('in %s days', i);
                    }
                },
                conditionToCreateState(objDevice: Prognose, objChannel: Prognose, adapter: ioBroker.myAdapter): boolean {
                    // only wired and wireless clients
                    return adapter.config.dailyEnabled || adapter.config.hourlyEnabled;
                },
                array: {
                    energy: {
                        iobType: 'number',
                        unit: 'kWh',
                        conditionToCreateState(objDevice: Prognose, objChannel: Prognose, adapter: ioBroker.myAdapter): boolean {
                            // only wired and wireless clients
                            return adapter.config.dailyEnabled;
                        },
                        readVal(val: number, adapter: ioBroker.myAdapter, device: Prognose, channel: PrognoseDaily, id: string) {
                            return Math.round(val * 1000) / 1000;
                        },
                    },
                    energy_now: {
                        iobType: 'number',
                        unit: 'kWh',
                        conditionToCreateState(objDevice: Prognose, objChannel: Prognose, adapter: ioBroker.myAdapter): boolean {
                            // only wired and wireless clients
                            return adapter.config.dailyEnabled;
                        },
                        readVal(val: number, adapter: ioBroker.myAdapter, device: Prognose, channel: PrognoseDaily, id: string) {
                            return Math.round(val * 1000) / 1000;
                        },
                    },
                    energy_from_now: {
                        iobType: 'number',
                        unit: 'kWh',
                        conditionToCreateState(objDevice: Prognose, objChannel: Prognose, adapter: ioBroker.myAdapter): boolean {
                            // only wired and wireless clients
                            return adapter.config.dailyEnabled;
                        },
                        readVal(val: number, adapter: ioBroker.myAdapter, device: Prognose, channel: PrognoseDaily, id: string) {
                            return Math.round(val * 1000) / 1000;
                        },
                    },
                    hourly: {
                        arrayChannelIdFromProperty(objDevice: Prognose, objChannel: PrognoseHourly, i: number, adapter: ioBroker.myAdapter): string {
                            return `${myHelper.zeroPad(moment(objChannel.timestamp).hour(), 2)}h`;
                        },
                        arrayChannelNameFromProperty(objDevice: Prognose, objChannel: PrognoseHourly, i: number, adapter: ioBroker.myAdapter): string | ioBroker.Translated {
                            return adapter.myIob.utils.I18n.getTranslatedObject('%s o\'clock', moment(objChannel.timestamp).hour())
                        },
                        conditionToCreateState(objDevice: Prognose, objChannel: Prognose, adapter: ioBroker.myAdapter): boolean {
                            // only wired and wireless clients
                            return adapter.config.hourlyEnabled;
                        },
                        array: {
                            energy: {
                                iobType: 'number',
                                unit: 'kWh',
                                readVal(val: number, adapter: ioBroker.myAdapter, device: Prognose, channel: PrognoseHourly, id: string) {
                                    return Math.round(val * 1000) / 1000;
                                },
                            },
                            power: {
                                iobType: 'number',
                                unit: 'kW',
                                readVal(val: number, adapter: ioBroker.myAdapter, device: Prognose, channel: PrognoseHourly, id: string) {
                                    return Math.round(val * 1000) / 1000;
                                },
                            },
                        }
                    }
                },
            }

        }
    }

    export function getKeys(): string[] {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
            // manual add keys here:
            keys.push(...['fingerprint.computed_engine', 'fingerprint.dev_id_override', 'fingerprint.dev_id', 'fingerprint.has_override']);
        }

        return keys
    }

    export function getStateIDs(): string[] {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
}
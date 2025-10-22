const commonDef = {
    number: {
        name: '',
        type: 'number',
        read: true,
        write: false,
        role: 'value',
        def: null
    },
    string: {
        name: '',
        type: 'string',
        read: true,
        write: false,
        role: 'value',
        def: null
    }
};
export const stateDefinition = {
    statusResponse: {
        id: 'status',
        common: {
            ...commonDef.number, ...{
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
            }
        }
    },
    jsonTable: {
        id: 'json',
        common: {
            name: 'json table',
            //@ts-ignore
            type: 'json',
            read: true,
            write: false,
            role: 'json',
            def: '{}'
        },
    },
    lastUpdate: {
        id: 'lastUpdate',
        common: commonDef.string
    },
    accuracy: {
        id: 'accuracy',
        common: commonDef.number
    },
    date: {
        id: 'date',
        common: commonDef.string
    },
    power: {
        id: 'power',
        common: { ...commonDef.number, ...{ unit: 'kW' } }
    },
    energy: {
        id: 'energy',
        common: { ...commonDef.number, ...{ unit: 'kWh' } }
    },
    energy_now: {
        id: 'energy_now',
        common: { ...commonDef.number, ...{ unit: 'kWh' } }
    },
    energy_from_now: {
        id: 'energy_from_now',
        common: { ...commonDef.number, ...{ unit: 'kWh' } }
    },
};

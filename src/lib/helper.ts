import _ from "lodash";
import { myTreeDefinition } from "./myIob.js";

export function zeroPad(source: any, places: number): string {
    const zero = places - source.toString().length + 1;
    return Array(+(zero > 0 && zero)).join('0') + source;
}

/**
 * Collect all properties used in tree defintions
 *
 * @param treefDefintion @see tree-devices.ts @see tree-clients.ts
 * @returns
 */
export function getAllKeysOfTreeDefinition(treefDefintion: { [key: string]: myTreeDefinition }): string[] {
    const keys = [];

    // Hilfsfunktion für rekursive Durchsuchung des Objekts
    function recurse(currentObj, prefix = ''): void {
        _.forOwn(currentObj, (value, key) => {
            const fullKey = (prefix ? `${prefix}.${key}` : key).replace('.array', '').replace('.object', '');

            // Wenn der Wert ein Objekt ist (und kein Array), dann weiter rekursiv gehen
            if (_.isObject(value) && typeof value !== 'function' && key !== 'states') {
                keys.push(fullKey);

                // Wenn es ein Array oder Object ist, dann rekursiv weitergehen
                if (_.isArray(value) || _.isObject(value)) {
                    // Nur unter "array" oder "object" rekursiv weiter
                    recurse(value, fullKey);
                }
            } else {
                if (key === 'valFromProperty') {
                    const lastIndex = prefix.lastIndexOf('.');
                    const prefixCleared = prefix.substring(0, lastIndex);
                    keys.push(`${prefixCleared ? `${prefixCleared}.` : ''}${value}`);
                }
            }
        });
    }

    // Start der Rekursion
    recurse(treefDefintion);

    return _.uniq(keys);
}

export function getAllIdsOfTreeDefinition(treefDefintion: { [key: string]: myTreeDefinition }): string[] {
    const keys = [];

    // Hilfsfunktion für rekursive Durchsuchung des Objekts
    function recurse(currentObj, prefix = ''): void {
        _.forOwn(currentObj, (value, key) => {
            let fullKey = prefix ? `${prefix}.${key}` : key;

            if (Object.hasOwn(value, 'idChannel') && !_.isObject(value.idChannel)) {
                fullKey = prefix ? `${prefix}.${value.idChannel}` : value.idChannel;
            } else if (Object.hasOwn(value, 'id') && !_.isObject(value.id)) {
                fullKey = prefix ? `${prefix}.${value.id}` : value.id;
            }

            fullKey = fullKey.replace('.array', '').replace('.object', '');

            // Wenn der Wert ein Objekt ist (und kein Array), dann weiter rekursiv gehen
            if (_.isObject(value) && typeof value !== 'function' && key !== 'states') {
                if (!_.has(value, 'required')) {
                    keys.push(fullKey);
                }

                // Wenn es ein Array oder Object ist, dann rekursiv weitergehen
                if (_.isArray(value) || _.isObject(value)) {
                    // Nur unter "array" oder "object" rekursiv weiter
                    recurse(value, fullKey);
                }
            }
        });
    }

    // Start der Rekursion
    recurse(treefDefintion);

    return _.uniq(keys);
}
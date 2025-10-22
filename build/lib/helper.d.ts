import { myTreeDefinition } from "./myIob.js";
export declare function zeroPad(source: any, places: number): string;
/**
 * Collect all properties used in tree defintions
 *
 * @param treefDefintion @see tree-devices.ts @see tree-clients.ts
 * @returns
 */
export declare function getAllKeysOfTreeDefinition(treefDefintion: {
    [key: string]: myTreeDefinition;
}): string[];
export declare function getAllIdsOfTreeDefinition(treefDefintion: {
    [key: string]: myTreeDefinition;
}): string[];

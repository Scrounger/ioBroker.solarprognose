import { myTreeDefinition } from "../myIob.js";
export declare namespace prognose {
    const idChannel = "forecast.current";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}

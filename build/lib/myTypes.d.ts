export type myTreeData = Prognose | PrognoseDaily | PrognoseHourly;
export interface Prognose {
    forecast: PrognoseDaily[];
    status: number;
    json: PrognoseHourly[];
    lastUpdate: number;
}
export interface PrognoseDaily {
    hourly: PrognoseHourly[];
    energy: number;
    energy_now?: number;
    energy_from_now?: number;
}
export interface PrognoseHourly {
    human: string;
    timestamp: number;
    power: number;
    energy: number;
}
export interface dataStructure {
    preferredNextApiRequestAt: preferredNextApiRequestAt;
    status: number;
    iLastPredictionGenerationEpochTime: number;
    datalinename: string;
    data: {
        [key: number]: Array<number>;
    };
}
export interface preferredNextApiRequestAt {
    secondOfHour: number;
    epochTimeUtc: number;
}
export interface tStateDefinition {
    id?: string;
    common?: ioBroker.StateCommon;
    ignore?: boolean;
}
export interface myJsonStructure {
    timestamp: number;
    human: string;
    val: number;
    total: number;
}
export interface myCommonDefinition {
    number: ioBroker.StateCommon;
    string: ioBroker.StateCommon;
}
export declare const stateDefinition: {
    [key: string]: tStateDefinition;
};

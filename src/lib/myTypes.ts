export type myTreeData = Prognose | PrognoseDaily | PrognoseHourly


export interface Prognose {
    forecast: PrognoseDaily[],
    status: number,
    json: PrognoseHourly[],
    lastUpdate: number,
}

export interface PrognoseDaily {
    hourly: PrognoseHourly[],
    energy: number,
    energy_now?: number,
    energy_from_now?: number,
    accuracy?: number,
}

export interface PrognoseHourly {
    human: string;
    timestamp: number,
    power: number,
    energy: number,
}
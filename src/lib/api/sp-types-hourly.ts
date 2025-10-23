export interface SolarPrognoseData {
    preferredNextApiRequestAt: SolarPrognosePreferredNextApiRequestAt
    status: number
    iLastPredictionGenerationEpochTime: number
    weather_source_text: string
    datalinename: string
    data: { [timestamp: string]: number[] }
}

export interface SolarPrognosePreferredNextApiRequestAt {
    secondOfHour: number
    epochTimeUtc: number
}
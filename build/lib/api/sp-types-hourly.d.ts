export interface SolarPrognoseData {
    preferredNextApiRequestAt: SolarPrognosePreferredNextApiRequestAt;
    status: number;
    iLastPredictionGenerationEpochTime: number;
    weather_source_text: string;
    datalinename: string;
    data: SolarPrognoseHourlyData;
}
export interface SolarPrognosePreferredNextApiRequestAt {
    secondOfHour: number;
    epochTimeUtc: number;
}
export interface SolarPrognoseHourlyData {
    "1761105600": number[];
    "1761109200": number[];
    "1761112800": number[];
    "1761116400": number[];
    "1761120000": number[];
    "1761123600": number[];
    "1761127200": number[];
}

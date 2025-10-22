import { type Dispatcher } from "undici";
import { SolarPrognoseData } from "./sp-types-hourly.js";
export type Nullable<T> = T | null;
/**
 * Configuration options for HTTP requests executed by `retrieve()`.
 */
export type RequestOptions = {
    /**
     * Optional custom Undici `Dispatcher` instance to use for this request.
     * use cases.
     */
    dispatcher?: Dispatcher;
} & Omit<Dispatcher.RequestOptions, "origin" | "path">;
/**
 * Options to tailor the behavior
 */
export interface RetrieveOptions {
    timeout?: number;
}
export declare enum ApiEndpoints {
    hourly = "hourly"
}
export declare class SpApi {
    private logPrefix;
    private adapter;
    private log;
    private dispatcher;
    private headers;
    private apiErrorCount;
    connectionTimeout: ioBroker.Timeout | undefined;
    constructor(adapter: ioBroker.myAdapter);
    /**
     * Execute an HTTP fetch request to the Network controller.
     *
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   - Parameters to pass on for the endpoint request.
     * @param retrieveOptions
     * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
     */
    retrieve(url: string, options?: RequestOptions, retrieveOptions?: RetrieveOptions): Promise<Nullable<Dispatcher.ResponseData<unknown>>>;
    private _retrieve;
    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     *
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    retrievData(url: string, options?: RequestOptions, retry?: boolean): Promise<Record<string, any> | undefined>;
    responseOk(code?: number): boolean;
    getApiEndpoint(endpoint: ApiEndpoints, param?: string): string;
    getHourlyData(): Promise<SolarPrognoseData>;
}

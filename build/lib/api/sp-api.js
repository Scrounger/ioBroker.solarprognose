import { request } from "undici";
import { STATUS_CODES } from "node:http";
import util from "node:util";
import { API_TIMEOUT } from "./sp-settings.js";
import * as tree from '../tree/index.js';
export var ApiEndpoints;
(function (ApiEndpoints) {
    ApiEndpoints["hourly"] = "hourly";
})(ApiEndpoints || (ApiEndpoints = {}));
export class SpApi {
    logPrefix = 'SpApi';
    adapter;
    log;
    dispatcher;
    headers;
    apiErrorCount;
    connectionTimeout = undefined;
    constructor(adapter) {
        this.adapter = adapter;
        this.log = adapter.log;
    }
    /**
     * Execute an HTTP fetch request to the Network controller.
     *
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   - Parameters to pass on for the endpoint request.
     * @param retrieveOptions
     * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
     */
    async retrieve(url, options = { method: "GET" }, retrieveOptions = {}) {
        return this._retrieve(url, options, retrieveOptions);
    }
    // Internal interface to communicating HTTP requests with a Network controller, with error handling.
    async _retrieve(url, options = { method: "GET" }, retrieveOptions = {}, isRetry = false) {
        const logPrefix = `[${this.logPrefix}._retrieve]`;
        retrieveOptions.timeout ??= API_TIMEOUT;
        let response;
        // Create a signal handler to deliver the abort operation.
        const controller = new AbortController();
        this.connectionTimeout = this.adapter.setTimeout(() => controller.abort(), retrieveOptions.timeout);
        options.dispatcher = this.dispatcher;
        options.headers = this.headers;
        options.signal = controller.signal;
        try {
            // Execute the API request.
            response = await request(url, options);
            // Preemptively increase the error count.
            this.apiErrorCount++;
            if (!this.responseOk(response.statusCode)) {
                this.log.error(`${logPrefix} Unable to retrieve data. code: ${response?.statusCode}, text: ${STATUS_CODES[response.statusCode]}, url: ${url}`);
                return null;
            }
            // We're all good - return the response and we're done.
            this.apiErrorCount = 0;
            return response;
        }
        catch (error) {
            this.log.error(`${logPrefix} Error: ${util.inspect(error, { colors: true, depth: null, sorted: true })}`);
            return null;
        }
        finally {
            // Clear out our response timeout.
            this.adapter.clearTimeout(this.connectionTimeout);
        }
    }
    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     *
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    async retrievData(url, options = { method: 'GET' }, retry = true) {
        const logPrefix = `[${this.logPrefix}.retrievData]`;
        try {
            const response = await this.retrieve(url, options);
            if (response) {
                const data = await response.body.json();
                if (data) {
                    return data;
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return retry ? await this.retrievData(url, options, false) : undefined;
    }
    responseOk(code) {
        return (code !== undefined) && (code >= 200) && (code < 300);
    }
    getApiEndpoint(endpoint, param = undefined) {
        const endpointPrefix = 'https://www.solarprognose.de/web/solarprediction/api/v1';
        let endpointSuffix;
        switch (endpoint) {
            case ApiEndpoints.hourly:
                endpointSuffix = `?access-token=${this.adapter.config.accessToken}&project=${this.adapter.config.project}&item=${this.adapter.config.solarprognoseItem}&id=${this.adapter.config.solarprognoseId}&algorithm=${this.adapter.config.solarprognoseAlgorithm}&type=hourly&_format=json`;
                break;
        }
        if (!endpointSuffix) {
            return '';
        }
        return `${endpointPrefix}${endpointSuffix}`;
    }
    async getHourlyData() {
        const logPrefix = `[${this.logPrefix}.getHourlyData]`;
        try {
            if (!this.adapter.testMode) {
                const res = await this.retrievData(this.getApiEndpoint(ApiEndpoints.hourly));
                if (res && res.status === 0) {
                    this.log.debug(`${logPrefix} ${JSON.stringify(res)}`);
                    return res;
                }
                else {
                    if (res.status !== 0) {
                        this.log.error(`${logPrefix} data received with error code: ${res.status} - ${tree.prognose.get().status.states[res.status]}`);
                        this.log.debug(`${logPrefix} ${JSON.stringify(res)}`);
                        return res;
                    }
                }
            }
            else {
                this.log.warn(`${logPrefix} Test mode is active!`);
                const data = await import('../../../test/testDataHourly.json', { assert: { type: 'json' } });
                return data.default;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
}

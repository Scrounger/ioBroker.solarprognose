// This file extends the AdapterConfig type from "@types/iobroker"
import { myIob } from './myIob.js'
import { SpApi } from './api/sp-api.js';

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			project: string;
			accessToken: string;
			solarprognoseItem: string;
			solarprognoseId: number;
			solarprognoseAlgorithm: string;
			jsonTableEnabled: boolean;
			hourlyEnabled: boolean;
			dailyEnabled: boolean;
			dailyMax: number;
			accuracyEnabled: boolean;
			todayEnergyObject: string;
			dailyInterpolation: boolean;
		}

		interface myAdapter extends ioBroker.Adapter {
			testMode: boolean;
			myIob: myIob;
			spApi: SpApi;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };
import getWeather, { canGoOutside } from "./weather";

// Define types for the FunctionCallingFns object
export type FunctionCallingFns = {
    canGoOutside: (params: { city: string, country: string }) => Promise<string>
    getCurrentTemperature: (params: { city: string, country: string }) => Promise<string>
}

/**
 * Object that contains functions to interact with weather-related functionalities.
 */
const functionCallingFns: FunctionCallingFns = {
    /**
     * Determines if one can go outside based on the weather.
     * @param params - The parameters containing city and country.
     * @returns A promise that resolves to 'true' or 'false' based on the weather condition.
     */
    canGoOutside: async (params: { city: string, country: string }): Promise<string> => {
        const { city, country } = params;
        const weather = await getWeather(city, country);
        const res = canGoOutside(weather);
        return res ? 'true' : 'false';
    },
    /**
     * Gets the temperature of a specific location.
     * @param params - The parameters containing city and country.
     * @returns A promise that resolves to the weather information.
     */
    getCurrentTemperature: async (params: { city: string, country: string }): Promise<string> => {
        const { city, country } = params;
        const weather = await getWeather(city, country);
        return weather.main.feels_like.toString();
    }
};

export default functionCallingFns
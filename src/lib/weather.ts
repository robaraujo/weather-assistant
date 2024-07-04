import axios from 'axios';
import { openWeatherApiKey } from './config';

export type WeatherResponse = {
  main: {
    feels_like: number;
    humidity: number;
  };
  weather: { main: string }[];
  wind: { speed: number };
};

const baseUrl = 'http://api.openweathermap.org/data/2.5/weather';

/**
 * Get weather from openweathermap API
 * @param city 
 * @param country 
 * @returns Promise<WeatherResponse>
 */
export default async function getWeather(city: string, country: string): Promise<WeatherResponse> {
  if (!city || !country) {
    throw new Error('Invalid address');
  }

  const response = await axios.get(`${baseUrl}?q=${city},${country}&appid=${openWeatherApiKey}&units=metric`);
  return response.data;
}

/**
 * Check if the weather is ok or not to go outside
 * @param weather WeatherResponse
 * @returns boolean
 */
export const canGoOutside = (weather: WeatherResponse) => {
  return weather.main.feels_like < 25 &&
      weather.main.humidity < 80 &&
      weather.weather[0].main !== 'Rain' &&
      weather.wind.speed < 5;
}
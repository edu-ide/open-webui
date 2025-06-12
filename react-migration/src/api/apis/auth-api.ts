/* tslint:disable */
/* eslint-disable */
/**
 * React Migration Auth API
 * 인증 관련 API
 *
 * @version 1.0.0
 */

import type { AxiosPromise, AxiosInstance, RawAxiosRequestConfig } from 'axios';
import { BASE_PATH, BaseAPI, RequestArgs, RequiredError } from '../base';
import { Configuration } from '../configuration';
import type { 
  ApiResponse, 
  AuthToken, 
  LoginRequest, 
  SignUpRequest, 
  User 
} from '../common';

/**
 * AuthApi - axios parameter creator
 * @export
 */
export const AuthApiAxiosParamCreator = function (configuration?: Configuration) {
    return {
        /**
         * 사용자 로그인
         * @param {LoginRequest} loginRequest 로그인 요청
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        login: async (loginRequest: LoginRequest, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            // verify required parameter 'loginRequest' is not null or undefined
            if (loginRequest === null || loginRequest === undefined) {
                throw new RequiredError('loginRequest','Required parameter loginRequest was null or undefined when calling login.');
            }
            const localVarPath = `/api/auth/login`;
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;

            localVarHeaderParameter['Content-Type'] = 'application/json';

            const query = new URLSearchParams(localVarUrlObj.search);
            for (const key in localVarQueryParameter) {
                query.set(key, localVarQueryParameter[key]);
            }
            for (const key in options.params) {
                query.set(key, options.params[key]);
            }
            localVarUrlObj.search = (new URLSearchParams(query)).toString();
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};
            localVarRequestOptions.data = JSON.stringify(loginRequest);

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
        /**
         * 사용자 회원가입
         * @param {SignUpRequest} signUpRequest 회원가입 요청
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        signUp: async (signUpRequest: SignUpRequest, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            // verify required parameter 'signUpRequest' is not null or undefined
            if (signUpRequest === null || signUpRequest === undefined) {
                throw new RequiredError('signUpRequest','Required parameter signUpRequest was null or undefined when calling signUp.');
            }
            const localVarPath = `/api/auth/signup`;
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;

            localVarHeaderParameter['Content-Type'] = 'application/json';

            const query = new URLSearchParams(localVarUrlObj.search);
            for (const key in localVarQueryParameter) {
                query.set(key, localVarQueryParameter[key]);
            }
            for (const key in options.params) {
                query.set(key, options.params[key]);
            }
            localVarUrlObj.search = (new URLSearchParams(query)).toString();
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};
            localVarRequestOptions.data = JSON.stringify(signUpRequest);

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
        /**
         * 현재 사용자 정보 조회
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        getCurrentUser: async (options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            const localVarPath = `/api/auth/me`;
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;

            const query = new URLSearchParams(localVarUrlObj.search);
            for (const key in localVarQueryParameter) {
                query.set(key, localVarQueryParameter[key]);
            }
            for (const key in options.params) {
                query.set(key, options.params[key]);
            }
            localVarUrlObj.search = (new URLSearchParams(query)).toString();
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
        /**
         * 로그아웃
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        logout: async (options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            const localVarPath = `/api/auth/logout`;
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;

            const query = new URLSearchParams(localVarUrlObj.search);
            for (const key in localVarQueryParameter) {
                query.set(key, localVarQueryParameter[key]);
            }
            for (const key in options.params) {
                query.set(key, options.params[key]);
            }
            localVarUrlObj.search = (new URLSearchParams(query)).toString();
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
        /**
         * 토큰 갱신
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        refreshToken: async (options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            const localVarPath = `/api/auth/refresh`;
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;

            const query = new URLSearchParams(localVarUrlObj.search);
            for (const key in localVarQueryParameter) {
                query.set(key, localVarQueryParameter[key]);
            }
            for (const key in options.params) {
                query.set(key, options.params[key]);
            }
            localVarUrlObj.search = (new URLSearchParams(query)).toString();
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
    }
};

/**
 * AuthApi - functional programming interface
 * @export
 */
export const AuthApiFp = function(configuration?: Configuration) {
    return {
        /**
         * 사용자 로그인
         * @param {LoginRequest} loginRequest 로그인 요청
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async login(loginRequest: LoginRequest, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<AuthToken>>> {
            const localVarAxiosArgs = await AuthApiAxiosParamCreator(configuration).login(loginRequest, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 사용자 회원가입
         * @param {SignUpRequest} signUpRequest 회원가입 요청
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async signUp(signUpRequest: SignUpRequest, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<User>>> {
            const localVarAxiosArgs = await AuthApiAxiosParamCreator(configuration).signUp(signUpRequest, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 현재 사용자 정보 조회
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async getCurrentUser(options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<User>>> {
            const localVarAxiosArgs = await AuthApiAxiosParamCreator(configuration).getCurrentUser(options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 로그아웃
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async logout(options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<void>>> {
            const localVarAxiosArgs = await AuthApiAxiosParamCreator(configuration).logout(options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 토큰 갱신
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async refreshToken(options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<AuthToken>>> {
            const localVarAxiosArgs = await AuthApiAxiosParamCreator(configuration).refreshToken(options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
    }
};

/**
 * AuthApi - object-oriented interface
 * @export
 * @class AuthApi
 * @extends {BaseAPI}
 */
export class AuthApi extends BaseAPI {
    /**
     * 사용자 로그인
     * @param {LoginRequest} loginRequest 로그인 요청
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof AuthApi
     */
    public login(loginRequest: LoginRequest, options?: RawAxiosRequestConfig) {
        return AuthApiFp(this.configuration).login(loginRequest, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 사용자 회원가입
     * @param {SignUpRequest} signUpRequest 회원가입 요청
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof AuthApi
     */
    public signUp(signUpRequest: SignUpRequest, options?: RawAxiosRequestConfig) {
        return AuthApiFp(this.configuration).signUp(signUpRequest, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 현재 사용자 정보 조회
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof AuthApi
     */
    public getCurrentUser(options?: RawAxiosRequestConfig) {
        return AuthApiFp(this.configuration).getCurrentUser(options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 로그아웃
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof AuthApi
     */
    public logout(options?: RawAxiosRequestConfig) {
        return AuthApiFp(this.configuration).logout(options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 토큰 갱신
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof AuthApi
     */
    public refreshToken(options?: RawAxiosRequestConfig) {
        return AuthApiFp(this.configuration).refreshToken(options).then((request) => request(this.axios, this.basePath));
    }
}

import globalAxios from 'axios';
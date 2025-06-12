/* tslint:disable */
/* eslint-disable */
/**
 * React Migration Chat API
 * 채팅 관련 API
 *
 * @version 1.0.0
 */

import type { AxiosPromise, AxiosInstance, RawAxiosRequestConfig } from 'axios';
import { BASE_PATH, BaseAPI, RequestArgs, RequiredError } from '../base';
import { Configuration } from '../configuration';
import type { 
  ApiResponse, 
  PagedResponse,
  ChatSession, 
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse
} from '../common';

/**
 * ChatApi - axios parameter creator
 * @export
 */
export const ChatApiAxiosParamCreator = function (configuration?: Configuration) {
    return {
        /**
         * 채팅 세션 목록 조회
         * @param {number} [page] 페이지 번호
         * @param {number} [size] 페이지 크기
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        getChatSessions: async (page?: number, size?: number, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            const localVarPath = `/api/chat/sessions`;
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;

            if (page !== undefined) {
                localVarQueryParameter['page'] = page;
            }

            if (size !== undefined) {
                localVarQueryParameter['size'] = size;
            }

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
         * 채팅 세션 조회
         * @param {string} sessionId 세션 ID
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        getChatSession: async (sessionId: string, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            if (sessionId === null || sessionId === undefined) {
                throw new RequiredError('sessionId','Required parameter sessionId was null or undefined when calling getChatSession.');
            }
            const localVarPath = `/api/chat/sessions/{sessionId}`
                .replace(`{${"sessionId"}}`, encodeURIComponent(String(sessionId)));
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
         * 새 채팅 세션 생성
         * @param {string} [title] 세션 제목
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        createChatSession: async (title?: string, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            const localVarPath = `/api/chat/sessions`;
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
            localVarRequestOptions.data = JSON.stringify(title ? { title } : {});

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
        /**
         * 채팅 완성 요청
         * @param {ChatCompletionRequest} completionRequest 완성 요청
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        chatCompletion: async (completionRequest: ChatCompletionRequest, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            if (completionRequest === null || completionRequest === undefined) {
                throw new RequiredError('completionRequest','Required parameter completionRequest was null or undefined when calling chatCompletion.');
            }
            const localVarPath = `/api/chat/completions`;
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
            localVarRequestOptions.data = JSON.stringify(completionRequest);

            return {
                url: localVarUrlObj.pathname + localVarUrlObj.search + localVarUrlObj.hash,
                options: localVarRequestOptions,
            };
        },
        /**
         * 채팅 세션 삭제
         * @param {string} sessionId 세션 ID
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        deleteChatSession: async (sessionId: string, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            if (sessionId === null || sessionId === undefined) {
                throw new RequiredError('sessionId','Required parameter sessionId was null or undefined when calling deleteChatSession.');
            }
            const localVarPath = `/api/chat/sessions/{sessionId}`
                .replace(`{${"sessionId"}}`, encodeURIComponent(String(sessionId)));
            const localVarUrlObj = new URL(localVarPath, 'https://example.com');
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'DELETE', ...baseOptions, ...options};
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
 * ChatApi - functional programming interface
 * @export
 */
export const ChatApiFp = function(configuration?: Configuration) {
    return {
        /**
         * 채팅 세션 목록 조회
         * @param {number} [page] 페이지 번호
         * @param {number} [size] 페이지 크기
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async getChatSessions(page?: number, size?: number, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<PagedResponse<ChatSession>>> {
            const localVarAxiosArgs = await ChatApiAxiosParamCreator(configuration).getChatSessions(page, size, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 채팅 세션 조회
         * @param {string} sessionId 세션 ID
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async getChatSession(sessionId: string, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<ChatSession>>> {
            const localVarAxiosArgs = await ChatApiAxiosParamCreator(configuration).getChatSession(sessionId, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 새 채팅 세션 생성
         * @param {string} [title] 세션 제목
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async createChatSession(title?: string, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<ChatSession>>> {
            const localVarAxiosArgs = await ChatApiAxiosParamCreator(configuration).createChatSession(title, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 채팅 완성 요청
         * @param {ChatCompletionRequest} completionRequest 완성 요청
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async chatCompletion(completionRequest: ChatCompletionRequest, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ChatCompletionResponse>> {
            const localVarAxiosArgs = await ChatApiAxiosParamCreator(configuration).chatCompletion(completionRequest, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
        /**
         * 채팅 세션 삭제
         * @param {string} sessionId 세션 ID
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async deleteChatSession(sessionId: string, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ApiResponse<void>>> {
            const localVarAxiosArgs = await ChatApiAxiosParamCreator(configuration).deleteChatSession(sessionId, options);
            return (axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
                const axiosRequestArgs = {...localVarAxiosArgs.options, url: basePath + localVarAxiosArgs.url};
                return axios.request(axiosRequestArgs);
            };
        },
    }
};

/**
 * ChatApi - object-oriented interface
 * @export
 * @class ChatApi
 * @extends {BaseAPI}
 */
export class ChatApi extends BaseAPI {
    /**
     * 채팅 세션 목록 조회
     * @param {number} [page] 페이지 번호
     * @param {number} [size] 페이지 크기
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof ChatApi
     */
    public getChatSessions(page?: number, size?: number, options?: RawAxiosRequestConfig) {
        return ChatApiFp(this.configuration).getChatSessions(page, size, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 채팅 세션 조회
     * @param {string} sessionId 세션 ID
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof ChatApi
     */
    public getChatSession(sessionId: string, options?: RawAxiosRequestConfig) {
        return ChatApiFp(this.configuration).getChatSession(sessionId, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 새 채팅 세션 생성
     * @param {string} [title] 세션 제목
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof ChatApi
     */
    public createChatSession(title?: string, options?: RawAxiosRequestConfig) {
        return ChatApiFp(this.configuration).createChatSession(title, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 채팅 완성 요청
     * @param {ChatCompletionRequest} completionRequest 완성 요청
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof ChatApi
     */
    public chatCompletion(completionRequest: ChatCompletionRequest, options?: RawAxiosRequestConfig) {
        return ChatApiFp(this.configuration).chatCompletion(completionRequest, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 채팅 세션 삭제
     * @param {string} sessionId 세션 ID
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof ChatApi
     */
    public deleteChatSession(sessionId: string, options?: RawAxiosRequestConfig) {
        return ChatApiFp(this.configuration).deleteChatSession(sessionId, options).then((request) => request(this.axios, this.basePath));
    }
}

import globalAxios from 'axios';
# internal_api_client.InternalUserApi

All URIs are relative to *http://localhost:8081*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_internal_user_by_email**](InternalUserApi.md#get_internal_user_by_email) | **GET** /api/internal/users/by_email/{email} | 이메일로 내부 사용자 정보 조회
[**get_internal_user_by_id**](InternalUserApi.md#get_internal_user_by_id) | **GET** /api/internal/users/{userId} | 사용자 ID로 내부 사용자 정보 조회


# **get_internal_user_by_email**
> InternalUserResponse get_internal_user_by_email(email)

이메일로 내부 사용자 정보 조회

Open WebUI 등 내부 서비스가 사용자 이메일을 기반으로 상세 정보를 조회하기 위한 API.

### Example


```python
import internal_api_client
from internal_api_client.models.internal_user_response import InternalUserResponse
from internal_api_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:8081
# See configuration.py for a list of all supported configuration parameters.
configuration = internal_api_client.Configuration(
    host = "http://localhost:8081"
)


# Enter a context with an instance of the API client
async with internal_api_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = internal_api_client.InternalUserApi(api_client)
    email = 'email_example' # str | 조회할 사용자의 이메일 주소

    try:
        # 이메일로 내부 사용자 정보 조회
        api_response = await api_instance.get_internal_user_by_email(email)
        print("The response of InternalUserApi->get_internal_user_by_email:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling InternalUserApi->get_internal_user_by_email: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **email** | **str**| 조회할 사용자의 이메일 주소 | 

### Return type

[**InternalUserResponse**](InternalUserResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | 성공적으로 사용자 정보 조회 |  -  |
**404** | 해당 이메일의 사용자를 찾을 수 없음 |  -  |
**500** | 서버 내부 오류 |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_internal_user_by_id**
> InternalUserResponse get_internal_user_by_id(user_id)

사용자 ID로 내부 사용자 정보 조회

Open WebUI 등 내부 서비스가 사용자 ID를 기반으로 상세 정보를 조회하기 위한 API.

### Example


```python
import internal_api_client
from internal_api_client.models.internal_user_response import InternalUserResponse
from internal_api_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:8081
# See configuration.py for a list of all supported configuration parameters.
configuration = internal_api_client.Configuration(
    host = "http://localhost:8081"
)


# Enter a context with an instance of the API client
async with internal_api_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = internal_api_client.InternalUserApi(api_client)
    user_id = 'user_id_example' # str | 조회할 사용자의 ID

    try:
        # 사용자 ID로 내부 사용자 정보 조회
        api_response = await api_instance.get_internal_user_by_id(user_id)
        print("The response of InternalUserApi->get_internal_user_by_id:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling InternalUserApi->get_internal_user_by_id: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**| 조회할 사용자의 ID | 

### Return type

[**InternalUserResponse**](InternalUserResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | 성공적으로 사용자 정보 조회 |  -  |
**404** | 해당 ID의 사용자를 찾을 수 없음 |  -  |
**500** | 서버 내부 오류 |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)


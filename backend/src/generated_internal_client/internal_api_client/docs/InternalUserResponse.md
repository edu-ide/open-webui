# InternalUserResponse

내부 서비스에 제공되는 사용자 정보

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **str** | 사용자 ID (문자열 형태) | 
**name** | **str** | 사용자 이름 (닉네임) | 
**email** | **str** | 사용자 이메일 주소 | 
**role** | **str** | 사용자 역할 (예 user, admin) | 
**profile_image_url** | **str** | 사용자 프로필 이미지 URL | 
**last_active_at** | **int** | 마지막 활동 시간 (Unix timestamp, epoch milliseconds) | 
**updated_at** | **int** | 마지막 정보 수정 시간 (Unix timestamp, epoch milliseconds) | 
**created_at** | **int** | 계정 생성 시간 (Unix timestamp, epoch milliseconds) | 

## Example

```python
from internal_api_client.models.internal_user_response import InternalUserResponse

# TODO update the JSON string below
json = "{}"
# create an instance of InternalUserResponse from a JSON string
internal_user_response_instance = InternalUserResponse.from_json(json)
# print the JSON string representation of the object
print(InternalUserResponse.to_json())

# convert the object into a dict
internal_user_response_dict = internal_user_response_instance.to_dict()
# create an instance of InternalUserResponse from a dict
internal_user_response_from_dict = InternalUserResponse.from_dict(internal_user_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



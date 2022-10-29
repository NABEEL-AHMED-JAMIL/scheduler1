export interface ApiResponse {
    status: ApiCode;	    
    message: any;	    
    data: any;
    paging: any;
}

export enum ApiCode {	
    SUCCESS = 'SUCCESS',
    INVALID_REQUEST = 'INVALID_REQUEST',
    ALREADY_CONSUMED = 'ALREADY_CONSUMED',
    ERROR = 'ERROR',	
    DELETED = 'DELETED',	
    HTTP_400 = 'HTTP_400',	
    HTTP_500 = 'HTTP_500',	
    HTTP_404 = 'HTTP_404'	
} 
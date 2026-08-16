
export interface KafkaConnectionProfile {
    kafkaConnectionProfileId?: any;

    tenantId?: any;
    profileName?: string;

    environmentLabel?: string;
    bootstrapServers?: string;
    securityProtocol?: string;
    saslMechanism?: string;
    saslUsername?: string;
    saslPassword?: string;
    saslPasswordConfigured?: boolean;
    sslKeystoreBucket?: string;
    sslKeystoreLocation?: string;
    sslKeystorePassword?: string;
    sslKeystorePasswordConfigured?: boolean;
    sslKeyPassword?: string;
    sslKeyPasswordConfigured?: boolean;
    sslTruststoreBucket?: string;
    sslTruststoreLocation?: string;
    sslTruststorePassword?: string;
    sslTruststorePasswordConfigured?: boolean;
    sslEndpointIdentificationAlgorithm?: string;

    additionalProperties?: string;

    isDefault?: boolean;
    status?: string;
    connectionStatus?: 'UNTESTED' | 'SUCCESS' | 'FAILED';
    lastTestedAt?: any;
    lastTestMessage?: string;
    dateCreated?: any;
}

export const KAFKA_SECURITY_PROTOCOLS: string[] = ['PLAINTEXT', 'SASL_PLAINTEXT', 'SASL_SSL', 'SSL'];

export const KAFKA_SASL_MECHANISMS: string[] = ['PLAIN', 'SCRAM-SHA-256', 'SCRAM-SHA-512'];

export function isSaslProtocol(securityProtocol: string): boolean {
    return !!securityProtocol && securityProtocol.indexOf('SASL_') === 0;
}

export function isSslProtocol(securityProtocol: string): boolean {
    return securityProtocol === 'SSL' || securityProtocol === 'SASL_SSL';
}

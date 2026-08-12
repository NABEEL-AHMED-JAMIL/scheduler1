/**
 * @author Nabeel Ahmed
 */
export interface KafkaConnectionProfile {
    kafkaConnectionProfileId?: any;
    /** Null = platform-wide/shared profile, usable by any tenant without one of its own. */
    tenantId?: any;
    profileName?: string;
    /** Free-text label for humans, e.g. "local", "prod-remote-eu" -- purely descriptive. */
    environmentLabel?: string;
    bootstrapServers?: string;
    securityProtocol?: string;
    saslMechanism?: string;
    saslUsername?: string;
    saslPassword?: string;
    saslPasswordConfigured?: boolean;
    sslKeystoreLocation?: string;
    sslKeystorePassword?: string;
    sslKeystorePasswordConfigured?: boolean;
    sslKeyPassword?: string;
    sslKeyPasswordConfigured?: boolean;
    sslTruststoreLocation?: string;
    sslTruststorePassword?: string;
    sslTruststorePasswordConfigured?: boolean;
    sslEndpointIdentificationAlgorithm?: string;
    /** Free-form JSON object string of non-secret Kafka client properties. */
    additionalProperties?: string;
    /** This tenant's (or the platform's, for a null-tenant profile) default -- replaces the old
     * single-global-switch "connectionActive". */
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

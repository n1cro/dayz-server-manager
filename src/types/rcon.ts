export interface RconPlayer {
    id: string;
    name: string;
    beguid: string;
    ip: string;
    port: string;
    ping: string;
    lobby: boolean;
}

export interface RconBan {
    type: string; // 'ip' | 'guid',
    id: string;
    ban: string;
    time: string;
    reason: string;
}

export interface RconPlayerConnected {
    /**
     * The player slot as reported by battleye, used to address the player in rcon commands
     */
    id: string;
    name: string;
    ip?: string;
    port?: string;
    beguid?: string;
}

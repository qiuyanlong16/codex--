/**
 * Default nanobot health-server port.
 * Uses 18790 (gateway config default) to avoid conflict with the WebSocket
 * server which defaults to 8765. When user has ~/.nanobot/config.json with
 * a custom websocket.port, the main process reads it and uses that for the
 * nanobotUrl sent to the renderer.
 */
export const NANOBOT_DEFAULT_PORT = 18790;

export const DEFAULT_BIND_HOST = "127.0.0.1";

/** Extensions the ad-hoc audio extraction pipeline accepts -- matches AUDIO_EXTENSIONS in
 * job-search's mp3_noise_processing_extract_txt_f768927.py (the pipeline this reuses). */
export const AUDIO_SUPPORTED_EXTENSIONS = ['mp3', 'm4a'];

/** Extensions the video-upload endpoint accepts -- audio track is pulled out via ffmpeg
 * (etl/service/media_extract.py) before running through the same pipeline as audio. */
export const VIDEO_SUPPORTED_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi'];

/** Payload for AiAgentService#processAdHoc -- a fully ad-hoc provider+model+prompt+text call,
 * not tied to any saved AiAgent. Nothing here is persisted. */
export interface AdHocPromptRequest {
    provider?: any;
    apiEndpoint?: any;
    apiKey?: any;
    model?: any;
    instructions?: any;
    text?: any;
    jsonMode?: boolean;
}

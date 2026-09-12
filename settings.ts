export interface Md2WechatSettings {
	cliPath: string;
	coverPreset: string;
	illustrationPreset: string;
	agent: "codex" | "claude" | "";
	lastAccount: string;
}
export const DEFAULT_SETTINGS: Md2WechatSettings = {
	cliPath: "",
	coverPreset: "",
	illustrationPreset: "",
	agent: "",
	lastAccount: "",
};

import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const MODEL_ID = "browsertools-functiongemma-270m-v3";
const TOOLS = [
  {type: "function", function: {name: "convert_number", description: "Convert English and Korean number units.", parameters: {type: "object", properties: {query: {type: "string"}}, required: ["query"]}}},
  {type: "function", function: {name: "convert_currency", description: "Convert currencies when an amount and currency are present.", parameters: {type: "object", properties: {query: {type: "string"}}, required: ["query"]}}},
  {type: "function", function: {name: "convert_unit", description: "Convert length, area, weight, or temperature units.", parameters: {type: "object", properties: {query: {type: "string"}}, required: ["query"]}}},
  {type: "function", function: {name: "request_clarification", description: "Ask for missing conversion information.", parameters: {type: "object", properties: {question: {type: "string"}, missing: {type: "string", enum: ["value", "source_unit", "target_unit", "conversion_type"]}}, required: ["question", "missing"]}}},
  {type: "function", function: {name: "unsupported_request", description: "Handle requests unrelated to supported conversions.", parameters: {type: "object", properties: {message: {type: "string"}}, required: ["message"]}}}
];

env.useBrowserCache = true;
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/models/";
let tokenizer;
let model;
let backend = "WebGPU";

function progress(update = {}) {
  const labels = {
    initiate: "파일 확인",
    download: "모델 다운로드",
    progress: "모델 다운로드",
    done: "파일 준비",
    ready: "모델 실행 준비"
  };
  self.postMessage({
    type: "progress",
    label: labels[update.status] || "모델 준비",
    percent: update.progress
  });
}

async function loadModel(cached) {
  const started = performance.now();
  try {
    if (!self.navigator.gpu) {
      throw new Error("이 브라우저에서 WebGPU를 사용할 수 없습니다. 최신 Chrome 또는 Edge에서 열어 주세요.");
    }
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {progress_callback: progress});
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: "q4",
      device: "webgpu",
      progress_callback: progress
    });
    self.postMessage({type: "ready", cached, backend, loadMs: performance.now() - started});
  } catch (error) {
    self.postMessage({
      type: "load-error",
      error: error.message || String(error),
      stack: error.stack || ""
    });
  }
}

function escaped(value) {
  return `<escape>${String(value)}<escape>`;
}

function functionDeclaration(tool) {
  const fn = tool.function;
  const parameters = fn.parameters || {};
  const properties = Object.entries(parameters.properties || {}).map(([name, schema]) => {
    const enumPart = Array.isArray(schema.enum)
      ? `,enum:[${schema.enum.map(escaped).join(",")}]`
      : "";
    return `${name}:{description:${escaped(schema.description || "")}${enumPart},type:${escaped((schema.type || "string").toUpperCase())}}`;
  }).join(",");
  const required = (parameters.required || []).map(escaped).join(",");
  return `<start_function_declaration>declaration:${fn.name}`
    + `{description:${escaped(fn.description || "")}`
    + `,parameters:{properties:{${properties}},required:[${required}],type:${escaped((parameters.type || "object").toUpperCase())}}}`
    + `<end_function_declaration>`;
}

function buildInputs(text) {
  const declarations = TOOLS.map(functionDeclaration).join("");
  const prompt = `${tokenizer.bos_token || "<bos>"}<start_of_turn>developer\n`
    + `Choose exactly one function that best matches the user's conversion request.${declarations}<end_of_turn>\n`
    + `<start_of_turn>user\n${text.trim()}<end_of_turn>\n<start_of_turn>model\n`;
  return tokenizer(prompt, {padding: false, truncation: false});
}

async function classify(id, text) {
  const started = performance.now();
  try {
    const inputs = buildInputs(text);
    const output = await model.generate({
      ...inputs,
      max_new_tokens: 32,
      do_sample: false
    });
    const inputLength = inputs.input_ids.dims[1];
    const decoded = tokenizer.decode(output.slice(0, [inputLength, null]), {skip_special_tokens: false});
    const match = decoded.match(/(convert_number|convert_currency|convert_unit|request_clarification|unsupported_request)/);
    if (!match) throw new Error(`AI가 변환 종류를 결정하지 못했습니다: ${decoded.slice(-160)}`);
    self.postMessage({type: "result", id, tool: match[1], raw: decoded, modelMs: performance.now() - started});
  } catch (error) {
    self.postMessage({type: "request-error", id, error: error.message || String(error)});
  }
}

self.addEventListener("message", event => {
  const message = event.data || {};
  if (message.type === "load") loadModel(Boolean(message.cached));
  if (message.type === "classify") classify(message.id, message.text);
});

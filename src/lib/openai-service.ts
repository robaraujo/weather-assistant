import OpenAI from "openai";
import { AssistantStream } from "openai/lib/AssistantStream.mjs";
import { FunctionCallingFns } from "./openai-functions";
import { EventEmitter } from 'node:events';
import { ToolCall } from "openai/resources/beta/threads/runs/steps.mjs";

type ToolOutput = OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput;
type Message = OpenAI.Beta.Threads.Messages.Message;
type Run = OpenAI.Beta.Threads.Runs.Run;
type RequiredActionFunctionToolCall = OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall;

export class OpenAIService {
    openai;
    assistantId: string;
    functionCallingFns: FunctionCallingFns;

    constructor(apiKey: string, assistantId: string, functionCallingFns: FunctionCallingFns) {
        this.assistantId = assistantId;
        this.functionCallingFns = functionCallingFns;
        this.openai = new OpenAI({ apiKey });
    }

    /**
     * Streams a message to an OpenAI thread. If the thread ID is not provided, a new thread is created.
     * @param {string} content - The content of the message to be sent.
     * @param {string} [threadId] - The ID of the thread to which the message should be sent (optional).
     * @returns {Promise<AssistantStream>} - Returns an event emitter for handling the stream events.
     */
    async chatStream(content: string, threadId?: string): Promise<EventEmitter<any>> {
        try {
            // Create a new message in the thread
            threadId = await this.createMessage(content, threadId);

            // Return the messages stream
            const eventHandler = new EventEmitter();
            const stream = this.openai.beta.threads.runs.stream(threadId, { assistant_id: this.assistantId });
            stream.on('event', e => this.onStreamEvent(e, eventHandler));

            return eventHandler;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Sends a message to an OpenAI thread. If the thread ID is not provided, a new thread is created.
     * @param {string} content - The content of the message to be sent.
     * @param {string} [threadId] - The ID of the thread to which the message should be sent (optional).
     * @returns {Promise<{ messages: Message[] | undefined, threadId: string }>} - Returns the messages and the thread ID after handling the run status.
     */
    async chat(content: string, threadId?: string): Promise<{ messages: Message[] | undefined, threadId: string }> {
        try {
            // Create a new message in the thread
            threadId = await this.createMessage(content, threadId);

            // Create and poll a new run
            let run = await this.openai.beta.threads.runs.createAndPoll(threadId, { assistant_id: this.assistantId });

            // Handle the run status and return the messages
            const messages = await this.handleRunStatus(run, threadId);
            return { messages: messages as Message[], threadId };
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Handles the status of a run and returns the messages.
     * @param {Run} run - The run object to handle.
     * @param {string} threadId - The ID of the thread.
     * @returns {Promise<Message[] | undefined>} - Returns the messages if the run is completed or requires action.
     */
    private async handleRunStatus(run: Run, threadId: string): Promise<Message[] | undefined> {
        // Check if the run is completed
        if (run.status === "completed") {
            let messages = await this.openai.beta.threads.messages.list(threadId);
            return messages.data;
        } else if (run.status === "requires_action" && run?.required_action?.submit_tool_outputs.tool_calls) {
            const res = await this.handleRequiresAction(run.required_action.submit_tool_outputs.tool_calls, run.id, threadId);
            return this.handleRunStatus(res as Run, threadId);
        }
    }

    /**
     * Retrieves the thread ID or creates a new thread if not provided.
     * @param {string} [threadId] - The ID of the thread (optional).
     * @returns {Promise<string>} - Returns the thread ID.
     */
    private async getThreadId(threadId?: string) {
        return threadId || (await this.openai.beta.threads.create()).id;
    }

    /**
     * Creates a message in the specified thread.
     * @param {string} content - The content of the message.
     * @param {string} [threadId] - The ID of the thread (optional).
     * @returns {Promise<string>} - Returns the thread ID.
     */
    private async createMessage(content: string, threadId?: string) {
        threadId = await this.getThreadId(threadId);
        await this.openai.beta.threads.messages.create(threadId, { role: "user", content });
        return threadId;
    }

    /**
     * Handles the stream events and processes required actions.
     * @param {any} event - The event object.
     * @param {EventEmitter} [eventHandler] - The event handler (optional).
     * @returns {Promise<void>}
     */
    private async onStreamEvent(event: any, eventHandler?: EventEmitter): Promise<void> {
        eventHandler?.emit('event', event);
        const { data, data: { id, thread_id: threadId } } = event;

        try {
            // Retrieve events that are denoted with 'requires_action'
            if (event.event === "thread.run.requires_action") {
                this.handleRequiresAction(data.required_action.submit_tool_outputs.tool_calls, id, threadId, eventHandler);
            }
        } catch (error) {
            console.error("Error handling event:", error);
        }
    }

    /**
     * Calls the tools specified in the tool calls.
     * @param {ToolCall[] | RequiredActionFunctionToolCall[]} toolCalls - The tool calls to process.
     * @returns {Promise<ToolOutput[]>} - Returns the tool outputs.
     */
    private async callTools(toolCalls: ToolCall[] | RequiredActionFunctionToolCall[]) {
        const res = await Promise.all(toolCalls.map(async (tool: any): Promise<ToolOutput | undefined> => {
            const args = JSON.parse(tool.function.arguments);

            // Check if function exists in functionCallingFns
            if (this.functionCallingFns.hasOwnProperty(tool.function.name)) {
                const fn = this.functionCallingFns[tool.function.name as keyof FunctionCallingFns];
                const output = await fn(args);
                return { tool_call_id: tool.id, output };
            }
        }));

        return res.filter(Boolean) as ToolOutput[];
    }

    /**
     * Handles required actions by calling the necessary tools and submitting the outputs.
     * @param {ToolCall[] | RequiredActionFunctionToolCall[]} toolCalls - The tool calls to process.
     * @param {string} runId - The ID of the run.
     * @param {string} threadId - The ID of the thread.
     * @param {EventEmitter} [eventHandler] - The event handler (optional).
     * @returns {Promise<Run | undefined>}
     */
    private async handleRequiresAction(toolCalls: ToolCall[] | RequiredActionFunctionToolCall[], runId: string, threadId: string, eventHandler?: EventEmitter) {
        try {
            let toolOutputs = await this.callTools(toolCalls);

            if (!eventHandler) {
                return this.submitToolOutputs(toolOutputs, runId, threadId, eventHandler);
            }

            this.submitToolOutputsStream(toolOutputs, runId, threadId, eventHandler);
        } catch (error) {
            console.error("Error processing required action:", error);
        }
    }

    /**
     * Submits the tool outputs and polls for the result.
     * @param {ToolOutput[]} toolOutputs - The tool outputs to submit.
     * @param {string} runId - The ID of the run.
     * @param {string} threadId - The ID of the thread.
     * @param {EventEmitter} [eventHandler] - The event handler (optional).
     * @returns {Promise<Run | undefined>>}
     */
    private async submitToolOutputs(toolOutputs: ToolOutput[], runId: string, threadId: string, eventHandler?: EventEmitter): Promise<Run | undefined> {
        try {
            return this.openai.beta.threads.runs.submitToolOutputsAndPoll(threadId, runId, { tool_outputs: toolOutputs });
        } catch (error) {
            console.error("Error submitting tool outputs:", error);
        }
    }

    /**
     * Submits the tool outputs and returns a stream for the result.
     * @param {ToolOutput[]} toolOutputs - The tool outputs to submit.
     * @param {string} runId - The ID of the run.
     * @param {string} threadId - The ID of the thread.
     * @param {EventEmitter} [eventHandler] - The event handler (optional).
     * @returns {AssistantStream | undefined}
     */
    private submitToolOutputsStream(toolOutputs: ToolOutput[], runId: string, threadId: string, eventHandler?: EventEmitter): AssistantStream | undefined {
        try {
            const stream = this.openai.beta.threads.runs.submitToolOutputsStream(threadId, runId, { tool_outputs: toolOutputs });
            eventHandler && stream.on('event', e => eventHandler.emit('event', e));

            return stream;
        } catch (error) {
            console.error("Error submitting tool outputs:", error);
        }
    }
}

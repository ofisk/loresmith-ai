export interface Message {
  id?: string;
  role: string;
  content?: string;
  parts?: Array<{
    type: string;
    text?: string;
    toolInvocation?: {
      state: string;
      toolName: string;
      toolCallId: string;
      args?: any;
      result?: any;
    };
  }>;
  createdAt?: Date | string;
  data?: any;
}

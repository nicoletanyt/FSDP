import { useEffect, useId, useRef, useState } from "react";
import {
    Bot,
    Maximize2,
    MessageCircle,
    Minimize2,
    RotateCcw,
    Send,
    Square,
    X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { createInstructorChatClient } from "@/lib/instructor/chat";
import {
    followUpChatTopics,
    instructorChatTopics,
    starterChatTopics,
} from "@/lib/instructor/chat-topics";
import type { InstructorChatTopic } from "@/lib/instructor/chat-topics";
import ChatMarkdown from "@/components/instructor/ChatMarkdown";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    topic?: InstructorChatTopic;
};

const requestReply = createInstructorChatClient(supabase);
const greetingText = "Hi, I’m DojoGPT. Pick a question below, or ask about your students or teaching schedule.";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
});

function createMessage(
    role: ChatMessage["role"],
    content: string,
): ChatMessage {
    return { id: crypto.randomUUID(), role, content, timestamp: new Date() };
}

function AssistantAvatar({ className }: { className?: string }) {
    return (
        <Avatar aria-hidden="true" className={cn("size-7", className)}>
            <AvatarFallback className="bg-primary text-primary-foreground">
                <Bot className="size-4" />
            </AvatarFallback>
        </Avatar>
    );
}

function TopicSuggestions({
    topics,
    isFollowUp,
    onSelect,
}: {
    topics: readonly InstructorChatTopic[];
    isFollowUp: boolean;
    onSelect: (topic: InstructorChatTopic) => void;
}) {
    return (
        <div
            role="group"
            aria-label={isFollowUp ? "Follow-up questions" : "Suggested questions"}
            className="mt-4 flex flex-wrap gap-2"
        >
            {topics.map((topic) => (
                <button
                    key={topic}
                    type="button"
                    data-chat-topic={topic}
                    onClick={() => onSelect(topic)}
                    className="min-h-11 max-w-full whitespace-normal rounded-full border border-border bg-transparent px-4 py-2 text-left text-sm leading-relaxed text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [overflow-wrap:anywhere]"
                >
                    {instructorChatTopics[topic].label}
                </button>
            ))}
        </div>
    );
}

export default function FloatingChatbot({ userId }: { userId: string }) {
    const id = useId();
    const panelId = `${id}-panel`;
    const titleId = `${id}-title`;
    const inputId = `${id}-input`;
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [greeting, setGreeting] = useState(() => createMessage("assistant", greetingText));
    const [isTyping, setIsTyping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const expandRef = useRef<HTMLButtonElement>(null);
    const wasExpandedRef = useRef(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const visibleMessages = [greeting, ...messages];
    const lastMessage = visibleMessages.at(-1)!;
    useEffect(
        () => () => {
            requestRef.current?.abort();
            requestRef.current = null;
        },
        [],
    );

    useEffect(() => {
        if (!isOpen) return;

        const frame = requestAnimationFrame(() => {
            inputRef.current?.focus({ preventScroll: true });
        });

        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    // The expand control is re-created when content moves out of the portal.
    // Restore focus after that commit, rather than to the removed modal button.
    useEffect(() => {
        const wasExpanded = wasExpandedRef.current;
        wasExpandedRef.current = isExpanded;
        if (!wasExpanded || isExpanded) return;
        const frame = requestAnimationFrame(() => {
            (isOpen ? expandRef.current : launcherRef.current)?.focus({
                preventScroll: true,
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [isExpanded, isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const viewport = viewportRef.current;
        viewport?.scrollTo({
            top: messages.length ? viewport.scrollHeight : 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
        });
    }, [isOpen, isExpanded, messages, isTyping, error]);

    function closeChat() {
        setIsExpanded(false);
        setIsOpen(false);
        launcherRef.current?.focus({ preventScroll: true });
    }

    function toggleChat() {
        if (isOpen) {
            closeChat();
            return;
        }

        setIsOpen(true);
    }

    async function getReply(history: ChatMessage[]) {
        if (requestRef.current) return;
        const controller = new AbortController();
        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(100_000),
        ]);
        requestRef.current = controller;
        setIsTyping(true);
        setError(null);
        try {
            // Keep the chat conversational while retaining pagination and
            // identity guidance in the request. The local greeting is not sent.
            const turns = history.map(({ role, content, topic }) => ({
                role,
                content: role === "user" && topic ? instructorChatTopics[topic].prompt : content,
            }));
            const result = await requestReply(userId, turns, signal);
            if (requestRef.current !== controller || controller.signal.aborted)
                return;
            const reply = {
                ...createMessage("assistant", result.reply),
                topic: history.at(-1)?.topic,
            };
            setMessages((current) => [...current, reply]);
        } catch (failure) {
            if (requestRef.current !== controller || controller.signal.aborted)
                return;
            setError(
                signal.aborted
                    ? "The reply took too long. Please retry with a more specific question."
                    : failure instanceof Error
                        ? failure.message
                        : "Unable to get a reply. Please retry.",
            );
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setIsTyping(false);
            }
        }
    }

    function stopReply() {
        requestRef.current?.abort();
        requestRef.current = null;
        setIsTyping(false);
        setError("Reply stopped. You can retry your question.");
    }

    function resetChat() {
        stopReply();
        setMessages([]);
        setGreeting(createMessage("assistant", greetingText));
        setDraft("");
        setError(null);
        inputRef.current?.focus({ preventScroll: true });
    }

    function ask(content: string, topic?: InstructorChatTopic) {
        if (!content || content.length > 4000 || requestRef.current) return;

        const message = { ...createMessage("user", content), topic };
        const history = [...messages, message];
        setMessages(history);
        void getReply(history);
        inputRef.current?.focus({ preventScroll: true });
    }

    function sendMessage() {
        const content = draft.trim();
        if (!content || requestRef.current) return;
        ask(content);
        setDraft("");
    }

    function askTopic(topic: InstructorChatTopic) {
        // Selecting a suggestion must not erase an unfinished typed question.
        ask(instructorChatTopics[topic].label, topic);
    }

    const chatContent = (
        <>
            <header className="flex shrink-0 items-center gap-3 px-4 py-4 sm:px-5 [@media(max-height:500px)]:py-2">
                <AssistantAvatar className="size-10" />
                <div className="min-w-0 flex-1">
                    {isExpanded ? (
                        <DialogTitle id={titleId} className="text-sm font-semibold tracking-tight">
                            DojoGPT
                        </DialogTitle>
                    ) : (
                        <h2 id={titleId} className="text-sm font-semibold tracking-tight">
                            DojoGPT
                        </h2>
                    )}
                </div>
                <div className="flex shrink-0 items-center">
                    <Button
                        ref={expandRef}
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 sm:size-10"
                        aria-label={isExpanded ? "Minimize chat" : "Expand chat"}
                        onClick={() => setIsExpanded((current) => !current)}
                    >
                        {isExpanded ? (
                            <Minimize2 aria-hidden="true" />
                        ) : (
                            <Maximize2 aria-hidden="true" />
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 sm:size-10"
                        aria-label="New conversation"
                        onClick={resetChat}
                        disabled={!messages.length}
                    >
                        <RotateCcw aria-hidden="true" />
                    </Button>
                    {isExpanded ? (
                        <DialogClose
                            onClick={closeChat}
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-11 sm:size-10"
                                    aria-label="Close chat"
                                />
                            }
                        >
                            <X aria-hidden="true" />
                        </DialogClose>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-11 sm:size-10"
                            aria-label="Close chat"
                            onClick={closeChat}
                        >
                            <X aria-hidden="true" />
                        </Button>
                    )}
                </div>
            </header>

            <ScrollArea
                viewportRef={viewportRef}
                className="min-h-0 flex-1"
            >
                <div
                    className={cn(
                        "px-5 pt-3 pb-6 sm:px-6 [@media(max-height:500px)]:py-3",
                        messages.length > 0 && "space-y-6",
                    )}
                >
                    <div
                        role="log"
                        aria-label="Chat messages"
                        aria-live="polite"
                        aria-relevant="additions text"
                        className="space-y-7"
                    >
                        {visibleMessages.map((message) => (
                            <div
                                key={message.id}
                                data-chat-message={message.role}
                                data-chat-greeting={message.id === greeting.id ? "true" : undefined}
                                className={cn(
                                    "flex",
                                    message.role === "user" && "justify-end",
                                )}
                            >
                                <div
                                    className={cn(
                                        "min-w-0",
                                        message.role === "assistant"
                                            ? "w-full"
                                            : "max-w-[82%]",
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "break-words text-sm leading-[1.65] [overflow-wrap:anywhere]",
                                            message.role === "user"
                                                ? "rounded-2xl rounded-br-sm bg-muted px-4 py-3 text-foreground"
                                                : "text-card-foreground",
                                        )}
                                    >
                                        <span className="sr-only">
                                            {message.role === "user" ? "You" : "DojoGPT"}:{" "}
                                        </span>
                                        {message.role === "assistant" && message.id !== greeting.id ? (
                                            <ChatMarkdown content={message.content} />
                                        ) : (
                                            <p className="whitespace-pre-wrap">{message.content}</p>
                                        )}
                                    </div>
                                    {message.id === lastMessage.id && message.role === "assistant" && !isTyping && !error && (
                                        <TopicSuggestions
                                            topics={message.id === greeting.id ? starterChatTopics : followUpChatTopics(message.topic)}
                                            isFollowUp={message.id !== greeting.id}
                                            onSelect={askTopic}
                                        />
                                    )}
                                    <time
                                        dateTime={message.timestamp.toISOString()}
                                        className={cn(
                                            "mt-2 block text-3xs text-muted-foreground",
                                            message.role === "user" && "pr-1 text-right",
                                        )}
                                    >
                                        {timeFormatter.format(message.timestamp)}
                                    </time>
                                </div>
                            </div>
                        ))}
                    </div>
                    {isTyping && (
                        <div role="status" className="flex items-center gap-2">
                            <div className="flex items-center gap-1 py-2">
                                <span className="sr-only">DojoGPT is typing</span>
                                {[0, 150, 300].map((delay) => (
                                    <span
                                        key={delay}
                                        aria-hidden="true"
                                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
                                        style={{ animationDelay: `${delay}ms` }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="space-y-2">
                            <p role="alert" className="break-words text-sm text-destructive">
                                {error}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void getReply(messages)}
                                disabled={isTyping}
                            >
                                Retry reply
                            </Button>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <form
                className="shrink-0 bg-card px-4 pt-2 pb-4 sm:px-5 sm:pb-5 [@media(max-height:500px)]:p-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    sendMessage();
                }}
            >
                <div className="flex items-end gap-1 rounded-3xl border border-input px-2 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
                    <label htmlFor={inputId} className="sr-only">
                        Message DojoGPT
                    </label>
                    <Textarea
                        ref={inputRef}
                        id={inputId}
                        value={draft}
                        maxLength={4000}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (
                                event.key === "Enter" &&
                                !event.shiftKey &&
                                !event.nativeEvent.isComposing
                            ) {
                                event.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Message DojoGPT…"
                        rows={1}
                        className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-3 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-sm dark:bg-transparent"
                    />
                    {isTyping ? (
                        <Button
                            type="button"
                            size="icon-lg"
                            aria-label="Stop reply"
                            onClick={stopReply}
                            variant="ghost"
                            className="mb-0.5 rounded-full"
                        >
                            <Square aria-hidden="true" />
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            size="icon-lg"
                            disabled={!draft.trim()}
                            aria-label="Send message"
                            variant="ghost"
                            className="mb-0.5 rounded-full"
                        >
                            <Send aria-hidden="true" />
                        </Button>
                    )}
                </div>
            </form>
        </>
    );

    return (
        <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
            <div
                data-floating-chatbot
                className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
            >
                {!isExpanded && (
                    <Card
                        id={panelId}
                        role="dialog"
                        aria-modal={false}
                        aria-labelledby={titleId}
                        aria-hidden={!isOpen}
                        inert={!isOpen}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.stopPropagation();
                                closeChat();
                            }
                        }}
                        className={cn(
                            "absolute right-0 bottom-[calc(100%+0.75rem)] h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] w-[calc(100vw-2rem)] origin-bottom-right gap-0 rounded-3xl py-0 shadow-2xl transition-[opacity,transform] duration-200 ease-out sm:h-[min(42rem,calc(100dvh-8rem-env(safe-area-inset-bottom)))] sm:w-[min(29.875rem,calc(100vw-3rem))] motion-reduce:transition-none",
                            isOpen
                                ? "translate-y-0 scale-100 opacity-100"
                                : "pointer-events-none translate-y-2 scale-95 opacity-0",
                        )}
                    >
                        {chatContent}
                    </Card>
                )}
                <Button
                    ref={launcherRef}
                    type="button"
                    size="icon"
                    aria-label={isOpen ? "Close DojoGPT" : "Open DojoGPT"}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={toggleChat}
                    className="size-14 rounded-full shadow-lg ring-1 ring-background/10 transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
                >
                    <MessageCircle aria-hidden="true" className="size-6" />
                </Button>
            </div>
            {isExpanded && (
                <DialogContent
                    id={panelId}
                    aria-modal={true}
                    showCloseButton={false}
                    data-expanded-chat
                    initialFocus={inputRef}
                    finalFocus={false}
                    className="flex h-[min(52rem,calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-3xl bg-card p-0 text-card-foreground sm:max-w-4xl"
                >
                    {chatContent}
                </DialogContent>
            )}
        </Dialog>
    );
}

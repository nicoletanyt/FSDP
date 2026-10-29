import { useEffect, useId, useRef, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
};

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

function getDummyResponse(content: string) {
    const text = content.toLowerCase();

    if (/\b(hi|hello|hey)\b/.test(text)) {
        return "Hello! It’s nice to meet you. What can I help you with today?";
    }
    if (/\b(class|classes|schedule|calendar|lesson|lessons)\b/.test(text)) {
        return "Looking for your next class? Your dashboard is a good place to start checking your schedule and lesson details. What would you like to know?";
    }
    if (/\b(account|login|log in|sign in|password|profile)\b/.test(text)) {
        return "I can help with general account questions. You can sign in from the main navigation to access your dashboard. Which part do you need a hand with?";
    }
    if (/\b(thanks|thank you)\b/.test(text)) {
        return "You’re very welcome! Feel free to ask another question — I’m here to help.";
    }

    return "Thanks for your message! This is a demo conversation, but I can share general guidance about classes, schedules, or your account. What would you like to explore?";
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

export default function FloatingChatbot() {
    const id = useId();
    const panelId = `${id}-panel`;
    const titleId = `${id}-title`;
    const inputId = `${id}-input`;
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [pendingReplies, setPendingReplies] = useState<ChatMessage[]>([]);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const nextReply = pendingReplies[0];
    const isTyping = pendingReplies.length > 0;

    // Process one reply at a time without blocking additional user messages.
    useEffect(() => {
        if (!nextReply) return;

        const timeout = window.setTimeout(() => {
            const reply = createMessage(
                "assistant",
                getDummyResponse(nextReply.content),
            );
            setMessages((current) => [...current, reply]);
            setPendingReplies((current) => current.slice(1));
        }, 1100);

        return () => window.clearTimeout(timeout);
    }, [nextReply]);

    useEffect(() => {
        if (!isOpen) return;

        const frame = requestAnimationFrame(() => {
            inputRef.current?.focus({ preventScroll: true });
        });

        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const viewport = viewportRef.current;
        viewport?.scrollTo({
            top: viewport.scrollHeight,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
        });
    }, [isOpen, messages, isTyping]);

    function closeChat() {
        setIsOpen(false);
        launcherRef.current?.focus({ preventScroll: true });
    }

    function toggleChat() {
        if (isOpen) {
            closeChat();
            return;
        }

        if (messages.length === 0) {
            setMessages([
                createMessage(
                    "assistant",
                    "Hi there! 👋 I’m DojoGPT. How can I help you today? Ask me about classes, schedules, or getting started.",
                ),
            ]);
        }
        setIsOpen(true);
    }

    function sendMessage() {
        const content = draft.trim();
        if (!content) return;

        const message = createMessage("user", content);
        setMessages((current) => [...current, message]);
        setPendingReplies((current) => [...current, message]);
        setDraft("");
        inputRef.current?.focus({ preventScroll: true });
    }

    return (
        <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
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
                    "absolute right-0 bottom-[calc(100%+0.75rem)] h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] w-[calc(100vw-2rem)] origin-bottom-right gap-0 rounded-2xl py-0 shadow-2xl transition-[opacity,transform,visibility] duration-200 ease-out sm:h-[min(36rem,calc(100dvh-8rem-env(safe-area-inset-bottom)))] sm:w-96 motion-reduce:transition-none",
                    isOpen
                        ? "visible translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none invisible translate-y-2 scale-95 opacity-0",
                )}
            >
                <header className="flex shrink-0 items-center gap-3 border-b px-4 py-4">
                    <AssistantAvatar className="size-10" />
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="font-semibold tracking-tight">
                            DojoGPT
                        </h2>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span
                                aria-hidden="true"
                                className="size-1.5 rounded-full bg-emerald-500"
                            />
                            Online
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Close chat"
                        onClick={closeChat}
                    >
                        <X aria-hidden="true" />
                    </Button>
                </header>

                <ScrollArea
                    viewportRef={viewportRef}
                    className="min-h-0 flex-1 bg-muted/25"
                >
                    <div className="space-y-5 px-4 py-5">
                        <p className="text-center text-[11px] font-medium text-muted-foreground">
                            Your conversation starts here
                        </p>
                        <div
                            role="log"
                            aria-label="Chat messages"
                            aria-live="polite"
                            aria-relevant="additions text"
                            className="space-y-4"
                        >
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex items-end gap-2",
                                        message.role === "user" && "justify-end",
                                    )}
                                >
                                    {message.role === "assistant" && <AssistantAvatar />}
                                    <div className="min-w-0 max-w-[82%]">
                                        <p
                                            className={cn(
                                                "whitespace-pre-wrap break-words rounded-2xl px-3 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]",
                                                message.role === "user"
                                                    ? "rounded-br-sm bg-primary text-primary-foreground"
                                                    : "rounded-bl-sm border bg-card text-card-foreground shadow-xs",
                                            )}
                                        >
                                            <span className="sr-only">
                                                {message.role === "user" ? "You" : "DojoGPT"}:{" "}
                                            </span>
                                            {message.content}
                                        </p>
                                        <time
                                            dateTime={message.timestamp.toISOString()}
                                            className={cn(
                                                "mt-1 block px-1 text-[10px] text-muted-foreground",
                                                message.role === "user" && "text-right",
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
                                <AssistantAvatar />
                                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border bg-card px-4 py-3.5 shadow-xs">
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
                    </div>
                </ScrollArea>

                <form
                    className="shrink-0 border-t bg-card p-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        sendMessage();
                    }}
                >
                    <div className="flex items-end gap-2">
                        <label htmlFor={inputId} className="sr-only">
                            Message DojoGPT
                        </label>
                        <Textarea
                            ref={inputRef}
                            id={inputId}
                            value={draft}
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
                            placeholder="Type your message…"
                            rows={2}
                            className="max-h-32 min-h-11 flex-1 resize-none text-base sm:text-sm"
                        />
                        <Button
                            type="submit"
                            size="icon-lg"
                            disabled={!draft.trim()}
                            aria-label="Send message"
                            className="mb-0.5 rounded-xl"
                        >
                            <Send aria-hidden="true" />
                        </Button>
                    </div>
                </form>
            </Card>

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
    );
}

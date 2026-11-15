import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Bot, MessageCircle, Send, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
    answerFaq,
    fallbackAnswer,
    faqPrompts,
    matchTopic,
    starterTopics,
    type FaqLink,
    type FaqTopic,
} from "@/lib/chatbot-faq";
import { cn } from "@/lib/utils";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    links?: FaqLink[];
    followUps?: FaqTopic[];
};

// Keeps instant answers from flashing in before the typing indicator registers.
const MIN_REPLY_MS = 450;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
});

function createMessage(
    role: ChatMessage["role"],
    content: string,
    extra: Pick<ChatMessage, "links" | "followUps"> = {},
): ChatMessage {
    return { id: crypto.randomUUID(), role, content, timestamp: new Date(), ...extra };
}

/** Short replies that don't need an FAQ lookup. */
function smallTalk(text: string, isStudent: boolean) {
    if (/^\s*(hi|hello|hey)\b/i.test(text)) {
        return { text: "Hello! What would you like to know?", followUps: starterTopics(isStudent) };
    }
    if (/\b(thanks|thank you)\b/i.test(text)) {
        return { text: "You’re welcome! Anything else?", followUps: starterTopics(isStudent) };
    }
    return null;
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

/**
 * FAQ assistant for students and visitors. Instructors get the LLM-backed
 * FloatingChatbot from InstructorLayout instead, so this one stays hidden for them.
 */
export default function FaqChatbot() {
    const { profile } = useAuth();
    if (profile?.role === "instructor") return null;
    return <FaqChatbotPanel />;
}

function FaqChatbotPanel() {
    const id = useId();
    const panelId = `${id}-panel`;
    const titleId = `${id}-title`;
    const inputId = `${id}-input`;
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [pending, setPending] = useState(0);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { session, profile } = useAuth();
    const userId = session?.user.id;
    const isStudent = profile?.role === "student";
    const isTyping = pending > 0;
    const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

    /** Answers a typed message or a predefined prompt from the FAQ. */
    async function ask(content: string, topic?: FaqTopic) {
        setMessages((current) => [...current, createMessage("user", content)]);
        setPending((n) => n + 1);
        const started = Date.now();
        const quick = topic ? null : smallTalk(content, isStudent);
        const resolved = topic ?? matchTopic(content);
        const answer = quick
            ? { ...quick, links: [] }
            : resolved
              ? await answerFaq(resolved, userId)
              : fallbackAnswer(isStudent);
        const wait = MIN_REPLY_MS - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        setMessages((current) => [
            ...current,
            createMessage("assistant", answer.text, { links: answer.links, followUps: answer.followUps }),
        ]);
        setPending((n) => n - 1);
    }

    function openLink(link: FaqLink) {
        navigate(link.to);
        closeChat();
    }

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
                    "Hi there! 👋 I’m DojoGPT. Pick a question below, or type your own about grading, fees, classes or membership.",
                    { followUps: starterTopics(isStudent) },
                ),
            ]);
        }
        setIsOpen(true);
    }

    function sendMessage() {
        const content = draft.trim();
        if (!content) return;

        setDraft("");
        void ask(content);
        inputRef.current?.focus({ preventScroll: true });
    }

    return (
        <div data-floating-chatbot className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
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
                        <p className="text-center text-2xs font-medium text-muted-foreground">
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
                                        {!!message.links?.length && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {message.links.map((link) => (
                                                    <Button
                                                        key={link.to}
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => openLink(link)}
                                                        className="h-8 gap-1 rounded-full bg-card"
                                                    >
                                                        {link.label}
                                                        <ArrowRight aria-hidden="true" className="size-3.5" />
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                        {message.id === lastAssistantId && !isTyping && !!message.followUps?.length && (
                                            <div
                                                role="group"
                                                aria-label="Suggested questions"
                                                className="mt-2 flex flex-wrap gap-1.5"
                                            >
                                                {message.followUps.map((topic) => (
                                                    <button
                                                        key={topic}
                                                        type="button"
                                                        onClick={() => void ask(faqPrompts[topic], topic)}
                                                        className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                                    >
                                                        {faqPrompts[topic]}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <time
                                            dateTime={message.timestamp.toISOString()}
                                            className={cn(
                                                "mt-1 block px-1 text-3xs text-muted-foreground",
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
                            placeholder="Ask about grading, fees, classes…"
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

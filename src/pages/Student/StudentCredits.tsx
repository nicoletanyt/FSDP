import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { BadgeCheck, Sparkles, Loader2 } from "lucide-react";

import PageHeader from "@/components/shared/layout/PageHeader";
import { StatusBadge } from "@/components/shared/status/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    classPassAudience,
    isStudentMembership,
    resolveMembershipType,
    type MembershipType,
} from "@/lib/membership";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import CreditBatchList from "@/components/student/CreditBatchList";
import CreditBalanceCard from "./CreditBalanceCard";
import MembershipGate from "@/components/student/MembershipGate";
import { randomUUID } from "@/lib/uuid";

const UNLIMITED_CREDITS = 9999;

type PassPackage = {
    id: string;
    title: string;
    price: number;
    credits: number;
    /** Shown after the price: the per-class price, a discount, or how it's billed. Left out when it would repeat the line above. */
    priceNote?: string;
    validity: string;
    popular?: boolean;
    originalPrice?: number;
};

const ADULT_PASSES: PassPackage[] = [
    {
        id: "adult-10",
        title: "10 Session Pass",
        price: 270,
        credits: 10,
        priceNote: "$27.00 per class",
        validity: "Valid for 11 weeks",
    },
    {
        id: "adult-25",
        title: "25 Session Pass",
        price: 600,
        credits: 25,
        priceNote: "$24.00 per class",
        validity: "Valid for 4 months",
        popular: true,
    },
    {
        id: "adult-50",
        title: "50 Session Pass",
        price: 980,
        credits: 50,
        priceNote: "$19.60 per class",
        validity: "Valid for 6 months",
    },
    {
        id: "adult-1y",
        title: "1 Year Unlimited Pass",
        price: 2246.4,
        credits: UNLIMITED_CREDITS,
        priceNote: "Includes 10% discount",
        validity: "Valid for 12 months",
    },
    {
        id: "adult-12w",
        title: "12 Weeks' Unlimited Pass",
        price: 96,
        credits: UNLIMITED_CREDITS,
        priceNote: "every 2 weeks · 6 payments",
        validity: "Valid for 12 weeks",
    },
    {
        id: "adult-3m",
        title: "3 Months' Unlimited Pass",
        price: 576,
        credits: UNLIMITED_CREDITS,
        validity: "Valid for 3 months",
    },
];

const JUNIOR_PASSES: PassPackage[] = [
    {
        id: "junior-1m",
        title: "1 Month Pass",
        price: 150,
        credits: 4,
        priceNote: "$37.50 per class",
        validity: "Valid for 5 weeks",
    },
    {
        id: "junior-6m-24",
        title: "6 Months Pass (24 Sessions)",
        price: 834,
        credits: 24,
        priceNote: "$34.75 per class",
        validity: "Valid for 6 months",
        popular: true,
    },
    {
        id: "junior-6m-50",
        title: "6 Months Pass (50 Sessions)",
        price: 1200,
        credits: 50,
        priceNote: "$24.00 per class",
        validity: "Valid for 6 months",
    },
];

const STUDENT_DISCOUNT = 0.5;

async function checkoutErrorMessage(error: unknown) {
    // The checkout service couldn't be reached at all (offline, blocked): say so plainly.
    if ((error as { name?: string } | null)?.name === "FunctionsFetchError") {
        return "Couldn't reach checkout. Check your connection and try again.";
    }
    const context = (error as { context?: Response } | null)?.context;
    if (context instanceof Response) {
        try {
            const body = (await context.clone().json()) as { error?: unknown };
            if (typeof body.error === "string" && body.error) return body.error;
        } catch {
            // Fall through to the generic message.
        }
    }
    return error instanceof Error
        ? error.message
        : "Unable to start checkout. Try again.";
}

function applyStudentDiscount(packages: PassPackage[]): PassPackage[] {
    return packages.map((pass) => {
        const price = Math.round(pass.price * STUDENT_DISCOUNT * 100) / 100;
        return {
            ...pass,
            price,
            originalPrice: pass.price,
            priceNote:
                pass.credits === UNLIMITED_CREDITS
                    ? pass.priceNote
                    : `${money.format(price / pass.credits)} per class`,
        };
    });
}

/** Credit packs and unlimited passes are different choices, so they're listed apart. Empty groups are dropped. */
function passGroups(packages: PassPackage[]) {
    return [
        {
            id: "session",
            title: "Session passes",
            passes: packages.filter((pass) => pass.credits !== UNLIMITED_CREDITS),
        },
        {
            id: "unlimited",
            title: "Unlimited passes",
            passes: packages.filter((pass) => pass.credits === UNLIMITED_CREDITS),
        },
    ].filter((group) => group.passes.length);
}

function PassCard({
    pass,
    busy,
    redirecting,
    error,
    onBuy,
}: {
    pass: PassPackage;
    busy: boolean;
    redirecting: boolean;
    error: string;
    onBuy: () => void;
}) {
    const errorId = `checkout-error-${pass.id}`;
    return (
        // Phones: title and details across the top, then the price with Buy beside it (saves a row per card).
        // Wider screens: details on the left, Buy centred on the right.
        <Card
            className={`relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0 p-5 sm:items-center sm:p-4 ${pass.popular ? "bg-primary/5 ring-primary/40" : ""}`}
        >
            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                <h4 className="text-lg font-semibold">{pass.title}</h4>
                {pass.popular && (
                    <StatusBadge tone="info" dot={false}>
                        <Sparkles aria-hidden="true" />
                        Popular
                    </StatusBadge>
                )}
            </div>
            <p className="col-span-2 mt-1.5 text-sm text-muted-foreground sm:col-span-1 sm:mt-1">
                {pass.credits === UNLIMITED_CREDITS
                    ? "Unlimited classes"
                    : `${pass.credits} credits`}{" "}
                · {pass.validity}
            </p>
            <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 self-end sm:mt-2 sm:self-auto">
                <span className="text-2xl font-semibold tabular-nums">
                    {money.format(pass.price)}
                </span>
                {pass.originalPrice !== undefined && (
                    <span className="text-sm text-muted-foreground line-through tabular-nums">
                        <span className="sr-only">was </span>
                        {money.format(pass.originalPrice)}
                    </span>
                )}
                {pass.priceNote && (
                    <span className="text-sm text-muted-foreground">
                        {pass.priceNote}
                    </span>
                )}
            </div>

            <Button
                type="button"
                onClick={onBuy}
                disabled={busy}
                // Six "Buy" buttons: the name says which pass each one buys.
                aria-label={redirecting ? undefined : `Buy ${pass.title}`}
                aria-describedby={error ? errorId : undefined}
                className="mt-3 self-end px-6 sm:col-start-2 sm:row-span-3 sm:row-start-1 sm:mt-0 sm:self-center sm:px-8"
                size="lg"
            >
                {redirecting ? (
                    <>
                        <Loader2
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                        />
                        Redirecting…
                    </>
                ) : (
                    "Buy"
                )}
            </Button>
            {/* A failed checkout shows on the pass that was tapped; the top of the page may be off-screen. */}
            {error && (
                <p
                    id={errorId}
                    role="alert"
                    className="col-span-2 mt-3 text-sm text-destructive sm:text-right"
                >
                    {error}
                </p>
            )}
        </Card>
    );
}

export default function StudentCredits() {
    const { profile } = useAuth();
    const [searchParams] = useSearchParams();
    const [membershipType] = useState<MembershipType>(() =>
        resolveMembershipType(),
    );
    const [loadingPassId, setLoadingPassId] = useState<string | null>(null);
    const [error, setError] = useState<{ passId: string; message: string } | null>(
        null,
    );
    const checkoutState = searchParams.get("checkout");

    const audience = classPassAudience(membershipType);
    const isStudent = isStudentMembership(membershipType);

    const packages = useMemo(() => {
        const base = audience === "junior" ? JUNIOR_PASSES : ADULT_PASSES;
        return isStudent ? applyStudentDiscount(base) : base;
    }, [audience, isStudent]);

    const heading =
        audience === "junior" ? "Junior class passes" : "Adult class passes";

    // Sends the student to Stripe Checkout for this pass.
    const handlePurchase = async (pass: PassPackage) => {
        setLoadingPassId(pass.id);
        setError(null);

        try {
            // The Edge Function resolves the price server-side; never send an amount.
            // Only the verified webhook creates a batch and its expiration. Returning
            // from Checkout must never insert credits from the browser.
            const { data, error: fnError } = await supabase.functions.invoke<{
                url: string;
            }>("create-credit-checkout", {
                body: { passId: pass.id, membershipType },
                headers: { "Idempotency-Key": randomUUID() },
            });

            if (fnError) throw new Error(await checkoutErrorMessage(fnError));
            if (!data?.url) throw new Error("Stripe did not return a Checkout URL.");

            window.location.assign(data.url);
        } catch (err) {
            console.error(err);
            setError({
                passId: pass.id,
                message:
                    err instanceof Error
                        ? err.message
                        : "Unable to start checkout. Try again.",
            });
            setLoadingPassId(null);
        }
    };

    // Also support already-created Stripe sessions with the old return URL.
    if (checkoutState === "success")
        return <Navigate to={`/dashboard?${searchParams}`} replace />;

    return (
        <MembershipGate title="Credits" feature="Buying class passes">
            <section className="w-full">
                <PageHeader title="Credits" />

                {isStudent && (
                    <div>
                        <StatusBadge tone="success" dot={false}>
                            <BadgeCheck aria-hidden="true" />
                            50% student discount applied
                        </StatusBadge>
                    </div>
                )}

                {checkoutState === "cancel" && (
                    <Alert role="status" className="mt-6">
                        <AlertDescription>
                            Checkout was cancelled. No payment was taken.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="mt-6">
                    <CreditBalanceCard topUp={false} compact />
                </div>

                {/* Buying comes right after what you have; your passes follow. */}
                <section
                    className="mt-8 space-y-6"
                    aria-labelledby="buy-passes-title"
                >
                    <h2 id="buy-passes-title" className="text-lg font-semibold">
                        Buy {heading.toLowerCase()}
                    </h2>
                    {passGroups(packages).map((group) => (
                        <section
                            key={group.id}
                            className="space-y-3"
                            aria-labelledby={`pass-group-${group.id}`}
                        >
                            <h3
                                id={`pass-group-${group.id}`}
                                className="text-sm font-medium text-muted-foreground"
                            >
                                {group.title}
                            </h3>
                            <div className="grid gap-4 xl:grid-cols-2">
                                {group.passes.map((pass) => (
                                    <PassCard
                                        key={pass.id}
                                        pass={pass}
                                        busy={loadingPassId !== null}
                                        redirecting={loadingPassId === pass.id}
                                        error={
                                            error?.passId === pass.id ? error.message : ""
                                        }
                                        onBuy={() => void handlePurchase(pass)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </section>

                <CreditBatchList userId={profile?.id} />
            </section>
        </MembershipGate>
    );
}

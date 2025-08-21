"use client";
import { useState, useEffect, useCallback } from "react";
import { Offer } from "@/types/swap";
import { SwapService } from "@/services/swapService";

export const useSwapOffers = (swapService: SwapService | null) => {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchOffers = useCallback(async () => {
        if (!swapService) {
            setOffers([]);
            return;
        }

        setLoading(true);
        setError(null);
        
        try {
            const fetchedOffers = await swapService.fetchOffers();
            setOffers(fetchedOffers);
        } catch (err) {
            console.error("Error fetching offers:", err);
            setError("Failed to load offers");
            setOffers([]);
        } finally {
            setLoading(false);
        }
    }, [swapService]);

    // Auto-fetch offers when swapService changes
    useEffect(() => {
        fetchOffers();
    }, [fetchOffers]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!swapService) return;

        const interval = setInterval(fetchOffers, 30000);
        return () => clearInterval(interval);
    }, [fetchOffers, swapService]);

    const refetch = useCallback(() => {
        fetchOffers();
    }, [fetchOffers]);

    return {
        offers,
        loading,
        error,
        refetch
    };
};
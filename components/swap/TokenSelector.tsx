"use client";
import { Fragment } from "react";
import Image from "next/image";
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon } from "lucide-react";
import { TokenInfo, tokenList } from "@/lib/tokens";

interface TokenSelectorProps {
    selectedToken: TokenInfo;
    onTokenSelect: (token: TokenInfo) => void;
}

export const TokenSelector = ({ selectedToken, onTokenSelect }: TokenSelectorProps) => {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <Menu.Button className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 cursor-pointer hover:bg-slate-700/50 transition-colors">
                    <Image src={selectedToken.icon} alt={selectedToken.name} width={24} height={24} />
                    <span className="font-bold">{selectedToken.symbol}</span>
                    <ChevronDownIcon className="w-4 h-4" />
                </Menu.Button>
            </div>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items className="absolute z-10 mt-2 w-48 origin-top-right rounded-md bg-[rgb(var(--input-rgb))] shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                        {tokenList.map(token => (
                            <Menu.Item key={token.symbol}>
                                {({ active }) => (
                                    <button
                                        onClick={() => onTokenSelect(token)}
                                        className={`${active ? 'bg-purple-800/50 text-white' : 'text-gray-200'
                                            } group flex w-full items-center rounded-md px-2 py-2 text-sm gap-2`}
                                    >
                                        <Image src={token.icon} alt={token.name} width={20} height={20} />
                                        {token.name} ({token.symbol})
                                    </button>
                                )}
                            </Menu.Item>
                        ))}
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    );
};
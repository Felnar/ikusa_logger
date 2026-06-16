import { filesystem, os } from '@neutralinojs/lib';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuSettings, LuSave, LuUpload, LuX } from 'react-icons/lu';
import { List, type RowComponentProps } from 'react-window';
import { open_save_location } from '../../logic/file';
import { find_all_indicies } from '../../logic/util';
import { ModalManager } from '../modal/modal-store';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import Icon from '../ui/Icon';
import LoadingIndicator from '../ui/LoadingIndicator';
import {
    get_config,
    get_date,
    get_formatted_date,
    hexToString,
    update_config,
    type Config,
    type LogType
} from './config';
import ConfigModal from './ConfigModal';
import Select from './Select';

export interface LoggerProps {
    logs: LogType[];
    height?: number;
    loading?: boolean;
    onStatsUpdate?: (stats: { kills: number; deaths: number; kdr: number }) => void;
    onDeleteLog?: (index: number) => void;
    onIndicesChange?: (indices: { playerTwo: number; guild: number }) => void;
}

export interface LoggerRowProps {
    logs: LogType[];
    possibleKillOffsets: number[];
    killIndex: number;
    playerOneIndex: number;
    playerTwoIndex: number;
    guildIndex: number;
    updateNames: (target: 'player_one' | 'player_two' | 'guild', value: number) => void;
    getNameOptions: (i: number, log: LogType) => string[];
    onDeleteLog: (index: number) => void;
    translations: {
        killed: string;
        diedTo: string;
        from: string;
        deleteEntry: string;
    };
}

function Logger({ logs, height = 155, loading = false, onStatsUpdate, onDeleteLog, onIndicesChange }: LoggerProps) {
    const { t } = useTranslation();
    const [possibleNameOffsets, setPossibleNameOffsets] = useState<{ offset: number; count: number }[][]>([]);
    const [nameIndicies, setNameIndicies] = useState<number[]>([0, 0, 0, 0, 0]);
    const [playerOneIndex, setPlayerOneIndex] = useState(0);
    const [playerTwoIndex, setPlayerTwoIndex] = useState(1);
    const [guildIndex, setGuildIndex] = useState(2);
    const [possibleKillOffsets, setPossibleKillOffsets] = useState<number[]>([]);
    const [killIndex, setKillIndex] = useState(0);
    const [config, setConfig] = useState<Config | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        (async () => {
            const cfg = await get_config();
            setConfig(cfg);
            setPossibleKillOffsets([cfg.kill]);
            setPossibleNameOffsets([
                [{ offset: cfg.player_one, count: 1 }],
                [{ offset: cfg.player_two, count: 1 }],
                [{ offset: cfg.guild, count: 1 }]
            ]);
            setAutoScroll(cfg.auto_scroll);
        })();
    }, []);

    useEffect(() => {
        if (config) update_config({ ...config, auto_scroll: autoScroll });
    }, [autoScroll, config]);

    useEffect(() => {
        if (logs.length > 0) logsChanged();
    }, [logs]);

    useEffect(() => {
        if (!onStatsUpdate || logs.length === 0 || possibleKillOffsets.length === 0) return;

        let kills = 0;
        let deaths = 0;

        logs.forEach(log => {
            const killOffset = possibleKillOffsets[killIndex];
            if (killOffset !== undefined && log.hex.length > killOffset) {
                const isKill = log.hex[killOffset] === '1';
                isKill ? kills++ : deaths++;
            }
        });

        const kdr = deaths > 0 ? parseFloat((kills / deaths).toFixed(2)) : kills;
        onStatsUpdate({ kills, deaths, kdr });
    }, [logs, possibleKillOffsets, killIndex, onStatsUpdate]);

    function logsChanged() {
        if (autoScroll) setTimeout(scroll);

        if (logs.length < 50 || logs.length % 100 === 0) {
            const killOffsets = findKillOffset(logs);
            // Only re-point when detection found a toggling candidate. An all-kills
            // or all-deaths window returns [] — keep the persisted/seeded offset
            // instead of clobbering it with a low-evidence guess.
            if (killOffsets.length > 0) setPossibleKillOffsets(killOffsets);
            calculateConfig();
        }
    }

    async function calculateConfig() {
        let newPossibleNameOffsets = possibleNameOffsets.map((list) =>
            list.map((n) => ({ ...n, count: 0 }))
        );

        for (const log of logs) {
            for (let i = 0; i < log.names.length; i++) {
                const name = log.names[i];
                if (newPossibleNameOffsets[i]) {
                    const index = newPossibleNameOffsets[i].findIndex((n) => n.offset === name.offset);
                    index !== -1
                        ? newPossibleNameOffsets[i][index].count++
                        : newPossibleNameOffsets[i].push({ offset: name.offset, count: 1 });

                } else {
                    newPossibleNameOffsets[i] = [{ offset: name.offset, count: 1 }];
                }
            }
        }

        for (let i = 0; i < newPossibleNameOffsets.length; i++) {
            newPossibleNameOffsets[i] = newPossibleNameOffsets[i].sort((a, b) => b.count - a.count);
        }

        const identifiers = new Map<string, number>();
        for (const log of logs) {
            identifiers.set(log.identifier, (identifiers.get(log.identifier) || 0) + 1);
        }

        const identifier = Array.from(identifiers.entries())
            .sort((a, b) => b[1] - a[1])
            .map((a) => a[0])[0];

        setPossibleNameOffsets(newPossibleNameOffsets);
        await updateConfigWrapper(identifier);
    }

    async function updateConfigWrapper(identifier?: string) {
        if (!config) return;

        const newConfig = {
            ...config,
            patch: get_date(),
            identifier: identifier || config.identifier,
            player_one: possibleNameOffsets[playerOneIndex]?.[nameIndicies[playerOneIndex]]?.offset || 0,
            player_two: possibleNameOffsets[playerTwoIndex]?.[nameIndicies[playerTwoIndex]]?.offset || 0,
            guild: possibleNameOffsets[guildIndex]?.[nameIndicies[guildIndex]]?.offset || 0,
            kill: possibleKillOffsets[killIndex]
        };

        const updated = await update_config(newConfig);
        setConfig(updated);
    }

    function findKillOffset(logs: LogType[]) {
        // Candidate byte positions: anywhere a kill flag ('01') shows up, outside
        // the name regions. A Set de-dupes positions seen across multiple logs.
        const candidates = new Set<number>();
        for (const log of logs) {
            const indicies = find_all_indicies(log.hex, '01').filter((index) =>
                log.names.every((n) => index > n.offset + 64 || index < n.offset)
            );
            for (const index of indicies) candidates.add(index);
        }

        // The real kill offset is a binary toggle: '01' for every kill, '00' for
        // every death. Score each candidate by how *consistently* it holds one of
        // those two values across all logs (coverage), NOT by the raw death count.
        // Ranking by death count alone bakes in the guild's K/D ratio, so a high-K/D
        // period drowns the real offset under noisy bytes that merely sit at '00' a
        // lot. '00' must still appear (deaths > 0) so we never trust a noisy '01'.
        const stats = Array.from(candidates).map((index) => {
            let kills = 0;
            let deaths = 0;
            for (const log of logs) {
                const byte = log.hex.slice(index, index + 2);
                if (byte === '01') kills++;
                else if (byte === '00') deaths++;
            }
            return { index, kills, deaths };
        });

        const sorted = stats
            // A real flag must actually toggle between kills and deaths.
            .filter((s) => s.kills > 0 && s.deaths > 0)
            .sort((a, b) => {
                // Most consistent (kill-or-death in the most logs) wins.
                const coverage = (b.kills + b.deaths) - (a.kills + a.deaths);
                if (coverage !== 0) return coverage;
                // Tie-break toward the position that toggles most evenly.
                return Math.min(b.kills, b.deaths) - Math.min(a.kills, a.deaths);
            })
            .map((s) => s.index + 1);

        return sorted;
    }

    function getName(i: number, log: LogType) {
        const list = possibleNameOffsets[i];
        if (!list) return '';
        const selected = nameIndicies[i];
        return hexToString(log.hex.slice(list[selected]?.offset, list[selected]?.offset + 64))
            .replaceAll('\0', '')
            .replaceAll(' ', '');
    }

    function getNameOptions(i: number, log: LogType) {
        return possibleNameOffsets.map((list, index) => {
            const selected = nameIndicies[index];
            return hexToString(log.hex.slice(list[selected]?.offset, list[selected]?.offset + 64))
                .replaceAll('\0', '')
                .replaceAll(' ', '');
        });
    }

    function updateNames(target: 'player_one' | 'player_two' | 'guild', value: number) {
        let newPlayerTwoIndex = playerTwoIndex;
        let newGuildIndex = guildIndex;

        if (target === 'player_one') {
            if (value === playerTwoIndex) {
                setPlayerTwoIndex(playerOneIndex);
                newPlayerTwoIndex = playerOneIndex;
            } else if (value === guildIndex) {
                setGuildIndex(playerOneIndex);
                newGuildIndex = playerOneIndex;
            }
            setPlayerOneIndex(value);
        } else if (target === 'player_two') {
            if (value === playerOneIndex) {
                setPlayerOneIndex(playerTwoIndex);
            } else if (value === guildIndex) {
                setGuildIndex(playerTwoIndex);
                newGuildIndex = playerTwoIndex;
            }
            setPlayerTwoIndex(value);
            newPlayerTwoIndex = value;
        } else if (target === 'guild') {
            if (value === playerOneIndex) {
                setPlayerOneIndex(guildIndex);
            } else if (value === playerTwoIndex) {
                setPlayerTwoIndex(guildIndex);
                newPlayerTwoIndex = guildIndex;
            }
            setGuildIndex(value);
            newGuildIndex = value;
        }

        // Notify parent of index changes
        onIndicesChange?.({
            playerTwo: newPlayerTwoIndex,
            guild: newGuildIndex
        });
    }

    function scroll() {
        const container = document.querySelector('.react-window-list');
        if (container) container.scrollTop = container.scrollHeight;
    }

    function getLogsString() {
        let output = '';
        for (const log of logs) {
            let characters = '';
            const playerOneName = getName(playerOneIndex, log);
            const playerTwoName = getName(playerTwoIndex, log);
            const guildName = getName(guildIndex, log);

            if (config?.include_characters) {
                const remainingIndicies = [0, 1, 2, 3, 4].filter(
                    (i) => i !== playerOneIndex && i !== playerTwoIndex && i !== guildIndex
                );
                const remainingNames = remainingIndicies.map((i) => getName(i, log));
                characters = ` (${remainingNames.join(',')})`;
            }

            const isKill = log.hex[possibleKillOffsets[killIndex]] === '1';

            if (isKill) {
                output += `[${log.time}] ${playerOneName} has killed ${playerTwoName} from ${guildName}${characters}\n`;
            } else {
                output += `[${log.time}] ${playerOneName} died to ${playerTwoName} from ${guildName}${characters}\n`;
            }

        }
        return output;
    }

    async function saveLogs() {
        const path = await open_save_location(get_formatted_date(get_date()) + '.log');
        await filesystem.writeFile(path, getLogsString());
    }

    function handleUploadToNodewar() {
        os.open('https://nodewar.gg/account');
    }

    const disabled = logs.length === 0 || loading;

    return (
        <div className="flex flex-col h-full w-full relative">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                    />
                    <span className="text-sm text-gray-400">{t('logger.autoScroll')}</span>
                </div>

                <div className="text-center text-gray-400 text-xs">
                    {t('logger.formatHint')} <span className="font-semibold text-gray-300">YourGuild-FamilyName</span> {t('logger.killed')}/{t('logger.diedTo')} <span className="font-semibold text-gray-300">Enemy-FamilyName</span> {t('logger.from')} <span className="font-semibold text-gray-300">Guild</span>
                </div>

                <button
                    onClick={() =>
                        config && ModalManager.open(ConfigModal, {
                            config,
                            options: {
                                possible_kill_offsets: possibleKillOffsets,
                                possible_name_offsets: possibleNameOffsets,
                                name_indicies: nameIndicies,
                                player_one_index: playerOneIndex,
                                player_two_index: playerTwoIndex,
                                guild_index: guildIndex,
                                kill_index: killIndex,
                                include_characters: config.include_characters
                            },
                            onChange: async (options: any) => {
                                setPossibleKillOffsets(options.possible_kill_offsets);
                                setPossibleNameOffsets(options.possible_name_offsets);
                                setNameIndicies(options.name_indicies);
                                setPlayerOneIndex(options.player_one_index);
                                setPlayerTwoIndex(options.player_two_index);
                                setGuildIndex(options.guild_index);
                                setKillIndex(options.kill_index);
                                if (config) {
                                    config.include_characters = options.include_characters;
                                    await updateConfigWrapper();
                                }
                            }
                        })
                    }
                    className="cursor-pointer p-2.5 group rounded-xl transition-all duration-300 hover:bg-white/10"
                    title={t('logger.advancedConfig')}
                >
                    <Icon icon={LuSettings} className="text-white" />
                </button>
            </div>

            <div className="flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/20 mb-3">
                {loading && logs.length === 0 ? (
                    <div className="flex justify-center items-center h-full">
                        <LoadingIndicator />
                    </div>
                ) : logs.length === 0 && !loading ? (
                    <div className="flex justify-center items-center h-full">
                        <p className="text-gray-400">{t('logger.waitingForLogs')}</p>
                    </div>
                ) : (
                    <List
                        className="react-window-list"
                        rowComponent={LoggerRowComponent}
                        rowCount={logs.length}
                        rowHeight={40}
                        rowProps={{
                            logs,
                            possibleKillOffsets,
                            killIndex,
                            playerOneIndex,
                            playerTwoIndex,
                            guildIndex,
                            updateNames,
                            getNameOptions,
                            onDeleteLog: (index: number) => onDeleteLog?.(index),
                            translations: {
                                killed: t('logger.killed'),
                                diedTo: t('logger.diedTo'),
                                from: t('logger.from'),
                                deleteEntry: t('logger.deleteEntry')
                            }
                        }}
                    />
                )}
            </div>

            <div className="flex gap-2 justify-center">
                <Button
                    className="w-full"
                    onClick={saveLogs}
                    disabled={disabled}
                    size="md"
                    color="primary"
                >
                    <Icon icon={LuSave} size="sm" className="mr-2" />
                    {t('logger.saveLogs')}
                </Button>
                <Button
                    className="w-full"
                    onClick={handleUploadToNodewar}
                    disabled={disabled}
                    size="md"
                    color="gradient"
                >
                    <Icon icon={LuUpload} size="sm" className="mr-2" />
                    {t('logger.uploadToNodewarGG')}
                </Button>
            </div>
        </div>
    );
}

function LoggerRowComponent({
    index,
    style,
    logs,
    possibleKillOffsets,
    killIndex,
    playerOneIndex,
    playerTwoIndex,
    guildIndex,
    updateNames,
    getNameOptions,
    onDeleteLog,
    translations
}: RowComponentProps<LoggerRowProps>) {
    const log = logs[index];
    const isKill = log.hex[possibleKillOffsets[killIndex]] === '1';

    return (
        <div style={style} className="flex gap-2 items-center px-2 hover:bg-white/5 group">
            <span className="text-xs text-gray-500 w-16">{log.time}</span>
            <Select
                options={getNameOptions(playerOneIndex, log)}
                selectedValue={playerOneIndex}
                onChange={(value) => updateNames('player_one', value)}
                className='w-full max-w-32 text-xs'
            />
            <div className="flex justify-center items-center w-20">
                {isKill ? (
                    <span className="text-xs font-medium text-green-400">{translations.killed}</span>
                ) : (
                    <span className="text-xs font-medium text-red-400">{translations.diedTo}</span>
                )}
            </div>
            <Select
                options={getNameOptions(playerTwoIndex, log)}
                selectedValue={playerTwoIndex}
                onChange={(value) => updateNames('player_two', value)}
                className='w-full max-w-32 text-xs'
            />
            <span className="text-xs text-gray-500">{translations.from}</span>
            <Select
                options={getNameOptions(guildIndex, log)}
                selectedValue={guildIndex}
                onChange={(value) => updateNames('guild', value)}
                className='w-full max-w-32 text-xs'
            />
            <button
                onClick={() => onDeleteLog(index)}
                className="cursor-pointer ml-auto p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/10 transition-colors opacity-0 group-hover:opacity-100 hover:border-red-400/20"
                title={translations.deleteEntry}
            >
                <Icon icon={LuX} size="sm" />
            </button>
        </div>
    );
}

export default Logger;

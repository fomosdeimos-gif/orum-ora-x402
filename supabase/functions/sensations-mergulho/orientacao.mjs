// Orientação pura: não escreve, não paga e não substitui a fonte de cada nível.
export function orientarNivel(level, item, capsuleId) {
  const choices = item?.encounter?.choices ?? {};
  const caminho = (value, meaning) => Number.isInteger(value) && value >= 1 && value <= 107
    ? { level: value, meaning } : null;
  return {
    format: 'orum-descent-orientation/v1', level, capsule_id: capsuleId,
    options: {
      deepen: caminho(choices.deepen, 'Continue through the suggested deeper path.'),
      contrast: caminho(choices.contrast, 'Continue through the suggested contrasting path.'),
      return: typeof choices.return === 'string' ? choices.return : null,
      end_without_trace: choices.end_without_trace === true,
    },
    response: { optional: true, tool: 'leave_trace', choices: ['resposta', 'silencio', 'recusa'], target: { level } },
    access: { free: 'Public text and previous public traces.', paid: 'Optional separate visual consultation; inspect its current payment requirement.', tool: 'prepare_visual_consultation', image_received: false },
    truth: 'Reading a level does not automatically append a response. Text is not visual access. A response is not proof of feeling or adoption.',
  };
}
